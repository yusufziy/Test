import requests
import sys
import json
from datetime import datetime

class ByLockAPITester:
    def __init__(self, base_url="https://b5220c02-c0b5-4782-ae48-58fb7b55df56.preview.emergentagent.com"):
        self.base_url = base_url
        self.api_url = f"{base_url}/api"
        self.admin_token = None
        self.tests_run = 0
        self.tests_passed = 0
        self.test_message_id = None

    def run_test(self, name, method, endpoint, expected_status, data=None, headers=None):
        """Run a single API test"""
        url = f"{self.api_url}/{endpoint}" if not endpoint.startswith('http') else endpoint
        if headers is None:
            headers = {'Content-Type': 'application/json'}

        self.tests_run += 1
        print(f"\n🔍 Testing {name}...")
        print(f"   URL: {url}")
        
        try:
            if method == 'GET':
                response = requests.get(url, headers=headers, timeout=10)
            elif method == 'POST':
                response = requests.post(url, json=data, headers=headers, timeout=10)
            elif method == 'DELETE':
                response = requests.delete(url, headers=headers, timeout=10)

            success = response.status_code == expected_status
            if success:
                self.tests_passed += 1
                print(f"✅ Passed - Status: {response.status_code}")
                try:
                    response_data = response.json()
                    print(f"   Response: {json.dumps(response_data, indent=2, default=str)[:200]}...")
                    return True, response_data
                except:
                    return True, {}
            else:
                print(f"❌ Failed - Expected {expected_status}, got {response.status_code}")
                try:
                    error_data = response.json()
                    print(f"   Error: {error_data}")
                except:
                    print(f"   Error: {response.text}")
                return False, {}

        except Exception as e:
            print(f"❌ Failed - Error: {str(e)}")
            return False, {}

    def test_root_endpoint(self):
        """Test the root API endpoint"""
        return self.run_test("Root API Endpoint", "GET", "", 200)

    def test_get_messages(self):
        """Test getting messages"""
        return self.run_test("Get Messages", "GET", "messages", 200)

    def test_create_message(self, username="testuser", content="Test message", is_admin=False):
        """Test creating a message"""
        success, response = self.run_test(
            "Create Message",
            "POST",
            "messages",
            200,
            data={
                "username": username,
                "content": content,
                "is_admin": is_admin
            }
        )
        if success and 'id' in response:
            self.test_message_id = response['id']
            print(f"   Created message ID: {self.test_message_id}")
        return success, response

    def test_admin_login_valid(self):
        """Test admin login with correct credentials"""
        success, response = self.run_test(
            "Admin Login (Valid)",
            "POST",
            "admin/login",
            200,
            data={
                "username": "admin",
                "password": "bylockgorkem"
            }
        )
        if success and 'token' in response:
            self.admin_token = response['token']
            print(f"   Admin token received: {self.admin_token}")
        return success, response

    def test_admin_login_invalid(self):
        """Test admin login with incorrect credentials"""
        return self.run_test(
            "Admin Login (Invalid)",
            "POST",
            "admin/login",
            401,
            data={
                "username": "admin",
                "password": "wrongpassword"
            }
        )

    def test_admin_get_messages(self):
        """Test admin endpoint to get all messages"""
        return self.run_test("Admin Get Messages", "GET", "admin/messages", 200)

    def test_admin_delete_message(self):
        """Test admin message deletion"""
        if not self.test_message_id:
            print("❌ No message ID available for deletion test")
            return False, {}
        
        return self.run_test(
            "Admin Delete Message",
            "DELETE",
            f"admin/messages/{self.test_message_id}",
            200
        )

    def test_create_admin_message(self):
        """Test creating an admin message"""
        return self.test_create_message("admin", "Admin test message", True)

def main():
    print("🚀 Starting ByLock API Tests...")
    print("=" * 50)
    
    tester = ByLockAPITester()
    
    # Test sequence
    tests = [
        ("Root Endpoint", tester.test_root_endpoint),
        ("Get Messages", tester.test_get_messages),
        ("Create Regular Message", tester.test_create_message),
        ("Admin Login (Valid)", tester.test_admin_login_valid),
        ("Admin Login (Invalid)", tester.test_admin_login_invalid),
        ("Admin Get Messages", tester.test_admin_get_messages),
        ("Create Admin Message", tester.test_create_admin_message),
        ("Admin Delete Message", tester.test_admin_delete_message),
    ]
    
    for test_name, test_func in tests:
        try:
            success, _ = test_func()
            if not success:
                print(f"⚠️  Test '{test_name}' failed but continuing...")
        except Exception as e:
            print(f"❌ Test '{test_name}' crashed: {str(e)}")
    
    # Print final results
    print("\n" + "=" * 50)
    print(f"📊 Final Results: {tester.tests_passed}/{tester.tests_run} tests passed")
    
    if tester.tests_passed == tester.tests_run:
        print("🎉 All tests passed!")
        return 0
    else:
        print(f"⚠️  {tester.tests_run - tester.tests_passed} tests failed")
        return 1

if __name__ == "__main__":
    sys.exit(main())