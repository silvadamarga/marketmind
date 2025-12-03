import queue
import json
import bot_logic
import ingestor

def test_ingestor():
    print("🚀 Testing Ingestor Module...")
    
    # Mock message
    mock_msg = json.dumps({
        "type": "push",
        "push": {
            "type": "mirror",
            "application_name": "TestApp",
            "package_name": "com.test.app",
            "title": "Test Title",
            "body": "Test Body",
            "icon": "base64..."
        }
    })
    
    print("1️⃣ Simulating WebSocket Message...")
    ingestor.on_message(None, mock_msg)
    
    print("2️⃣ Checking News Queue...")
    try:
        item = bot_logic.NEWS_QUEUE.get(timeout=2)
        print("✅ Item received in queue:")
        print(json.dumps(item, indent=2))
        
        if item['source'] == "TestApp" and item['title'] == "Test Title":
            print("✅ Data integrity verified.")
        else:
            print("❌ Data mismatch.")
            
    except queue.Empty:
        print("❌ Queue is empty! Ingestor failed to put item.")

if __name__ == "__main__":
    test_ingestor()
