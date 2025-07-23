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
        print(f"User {username} connected. Total connections: {len(self.active_connections)}")

    def disconnect(self, websocket: WebSocket, username: str = None):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)
        if username and username in self.user_connections:
            del self.user_connections[username]
        print(f"User {username} disconnected. Total connections: {len(self.active_connections)}")

    async def send_personal_message(self, message: str, websocket: WebSocket):
        try:
            await websocket.send_text(message)
        except Exception as e:
            print(f"Error sending personal message: {e}")

    async def broadcast(self, message: str):
        dead_connections = []
        for connection in self.active_connections:
            try:
                await connection.send_text(message)
            except Exception as e:
                print(f"Error broadcasting to connection: {e}")
                dead_connections.append(connection)
        
        # Remove dead connections
        for dead_conn in dead_connections:
            if dead_conn in self.active_connections:
                self.active_connections.remove(dead_conn)

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
    is_admin: bool = False

class Admin(BaseModel):
    username: str
    password: str

# API Routes
@api_router.get("/")
async def root():
    return {"message": "ByLock Özel Sohbet API Hazır"}

@api_router.post("/messages", response_model=Message)
async def create_message(message_data: MessageCreate):
    """Create a new message and broadcast it"""
    try:
        message_dict = message_data.dict()
        message_obj = Message(**message_dict)
        
        # Save to database
        await db.messages.insert_one(message_obj.dict())
        print(f"Message saved: {message_obj.username}: {message_obj.content}")
        
        # Broadcast to all connected clients
        broadcast_data = {
            "type": "new_message",
            "data": message_obj.dict()
        }
        await manager.broadcast(json.dumps(broadcast_data, default=str))
        print(f"Broadcasted to {len(manager.active_connections)} connections")
        
        return message_obj
    except Exception as e:
        logger.error(f"Error creating message: {e}")
        raise HTTPException(status_code=500, detail="Mesaj gönderilirken hata oluştu")

@api_router.get("/messages", response_model=List[Message])
async def get_messages(limit: int = 50):
    """Get recent messages"""
    try:
        messages = await db.messages.find().sort("timestamp", -1).limit(limit).to_list(limit)
        messages.reverse()  # Show oldest first
        return [Message(**msg) for msg in messages]
    except Exception as e:
        logger.error(f"Error getting messages: {e}")
        return []

@api_router.post("/admin/login")
async def admin_login(admin: Admin):
    """Admin login with bylockgorkem password"""
    if admin.username == "admin" and admin.password == "bylockgorkem":
        return {"success": True, "token": "admin_token_123"}
    raise HTTPException(status_code=401, detail="Geçersiz yönetici bilgileri")

@api_router.get("/admin/messages")
async def get_all_messages_admin(limit: int = 100):
    """Admin endpoint to get all messages"""
    try:
        messages = await db.messages.find().sort("timestamp", -1).limit(limit).to_list(limit)
        return [Message(**msg) for msg in messages]
    except Exception as e:
        logger.error(f"Error getting admin messages: {e}")
        return []

@api_router.delete("/admin/messages/{message_id}")
async def delete_message_admin(message_id: str):
    """Admin endpoint to delete a message"""
    try:
        result = await db.messages.delete_one({"id": message_id})
        if result.deleted_count == 0:
            raise HTTPException(status_code=404, detail="Mesaj bulunamadı")
        
        # Broadcast deletion
        broadcast_data = {
            "type": "message_deleted",
            "data": {"message_id": message_id}
        }
        await manager.broadcast(json.dumps(broadcast_data))
        
        return {"success": True}
    except Exception as e:
        logger.error(f"Error deleting message: {e}")
        raise HTTPException(status_code=500, detail="Mesaj silinirken hata oluştu")

# WebSocket endpoint
@app.websocket("/ws/{username}")
async def websocket_endpoint(websocket: WebSocket, username: str):
    await manager.connect(websocket, username)
    try:
        while True:
            data = await websocket.receive_text()
            # Echo back or handle specific WebSocket messages
            print(f"Received WebSocket data from {username}: {data}")
    except WebSocketDisconnect:
        manager.disconnect(websocket, username)
    except Exception as e:
        print(f"WebSocket error for {username}: {e}")
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