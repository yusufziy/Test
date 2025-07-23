from fastapi import FastAPI, APIRouter, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.responses import JSONResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import json
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Dict, Optional
import uuid
from datetime import datetime


ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Create the main app
app = FastAPI()

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

# WebSocket connection manager
class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []
        self.user_connections: Dict[str, WebSocket] = {}

    async def connect(self, websocket: WebSocket, username: str):
        await websocket.accept()
        self.active_connections.append(websocket)
        self.user_connections[username] = websocket

    def disconnect(self, websocket: WebSocket, username: str = None):
        self.active_connections.remove(websocket)
        if username and username in self.user_connections:
            del self.user_connections[username]

    async def send_personal_message(self, message: str, websocket: WebSocket):
        await websocket.send_text(message)

    async def broadcast(self, message: str):
        for connection in self.active_connections:
            try:
                await connection.send_text(message)
            except:
                # Remove dead connections
                self.active_connections.remove(connection)

manager = ConnectionManager()

# Models
class Message(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    username: str
    content: str
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    is_admin: bool = False

class MessageCreate(BaseModel):
    username: str
    content: str

class Admin(BaseModel):
    username: str
    password: str

# API Routes
@api_router.get("/")
async def root():
    return {"message": "Private Chat API Ready"}

@api_router.post("/messages", response_model=Message)
async def create_message(message_data: MessageCreate):
    """Create a new message and broadcast it"""
    message_dict = message_data.dict()
    message_obj = Message(**message_dict)
    
    # Save to database
    await db.messages.insert_one(message_obj.dict())
    
    # Broadcast to all connected clients
    broadcast_data = {
        "type": "new_message",
        "data": message_obj.dict()
    }
    await manager.broadcast(json.dumps(broadcast_data, default=str))
    
    return message_obj

@api_router.get("/messages", response_model=List[Message])
async def get_messages(limit: int = 50):
    """Get recent messages"""
    messages = await db.messages.find().sort("timestamp", -1).limit(limit).to_list(limit)
    messages.reverse()  # Show oldest first
    return [Message(**msg) for msg in messages]

@api_router.post("/admin/login")
async def admin_login(admin: Admin):
    """Simple admin login - in real app use proper auth"""
    if admin.username == "admin" and admin.password == "admin123":
        return {"success": True, "token": "admin_token_123"}
    raise HTTPException(status_code=401, detail="Invalid credentials")

@api_router.get("/admin/messages")
async def get_all_messages_admin(limit: int = 100):
    """Admin endpoint to get all messages"""
    messages = await db.messages.find().sort("timestamp", -1).limit(limit).to_list(limit)
    return [Message(**msg) for msg in messages]

@api_router.delete("/admin/messages/{message_id}")
async def delete_message_admin(message_id: str):
    """Admin endpoint to delete a message"""
    result = await db.messages.delete_one({"id": message_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Message not found")
    
    # Broadcast deletion
    broadcast_data = {
        "type": "message_deleted",
        "data": {"message_id": message_id}
    }
    await manager.broadcast(json.dumps(broadcast_data))
    
    return {"success": True}

# WebSocket endpoint
@app.websocket("/ws/{username}")
async def websocket_endpoint(websocket: WebSocket, username: str):
    await manager.connect(websocket, username)
    try:
        while True:
            data = await websocket.receive_text()
            # Handle incoming WebSocket messages if needed
            pass
    except WebSocketDisconnect:
        manager.disconnect(websocket, username)

# Include the router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()