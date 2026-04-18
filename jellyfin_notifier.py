import os
import json
import smtplib
import random
import sys
import urllib.request
from email.mime.text import MIMEText
from flask import Flask, request

app = Flask(__name__)

# --- CONFIGURATION ---
# Jellyfin API Setup
JELLYFIN_URL = "http://192.168.0.87:8096"
JELLYFIN_API_KEY = "043a53a028ae4b07a2b7607bcb562e8e"

# History Tracking (prevents Tdarr duplicates)
HISTORY_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'jellydad_history.json')

# Jellyfin Tags Mapping
NOTIFY_MAP = {
    "notify-dad": "5403940182@msg.fi.google.com",
    "notify-anna": "5409149059@msg.fi.google.com",
    "notify-jack": "5402529964@msg.fi.google.com",
    "notify-gin": "5406454042@msg.fi.google.com",
}

# Overseerr/Seerr Username Mapping
SEERR_USER_MAP = {
    "1-geocode": "notify-dad",
    "2-jellyanna": "notify-anna",
    "4-jellyjack": "notify-jack",
    "3-jellygin": "notify-gin",
}

SMTP_SERVER = "smtp.gmail.com"
SMTP_PORT = 587
SMTP_USER = "schaffersteve150@gmail.com"
SMTP_PASS = "fmbr gjiu revw wdzq"

def log_it(msg):
    print(msg)
    sys.stdout.flush()

def load_history():
    if os.path.exists(HISTORY_FILE):
        try:
            with open(HISTORY_FILE, 'r') as f:
                return json.load(f)
        except Exception as e:
            log_it(f"Jellydad error reading history: {e}")
    return []

def save_history(history_list):
    try:
        with open(HISTORY_FILE, 'w') as f:
            json.dump(history_list, f)
    except Exception as e:
        log_it(f"Jellydad error saving history: {e}")

def get_tags_from_api(item_id):
    if not item_id or JELLYFIN_API_KEY == "YOUR_API_KEY_HERE":
        return []
        
    url = f"{JELLYFIN_URL}/Items?Ids={item_id}&Fields=Tags&api_key={JELLYFIN_API_KEY}"
    
    try:
        req = urllib.request.Request(url)
        with urllib.request.urlopen(req) as response:
            data = json.loads(response.read().decode())
            if data.get('Items') and len(data['Items']) > 0:
                item = data['Items'][0]
                return item.get('Tags', [])
    except Exception as e:
        log_it(f"Jellydad error calling Jellyfin API for ID {item_id}: {e}")
        
    return []

def send_notification(recipient, data):
    is_tv = bool(data.get('SeriesName'))
    name = data.get('Name', 'Unknown Item')

    if is_tv:
        series = data.get('SeriesName')
        season_num = data.get('SeasonNumber', '0')
        episode_num = data.get('EpisodeNumber', '0')
        
        messages = [
            f"Oh Yeah! {series} S{season_num}E{episode_num} - '{name}' just dropped on JellyDad.",
            f"Hey JellyDad here! {series} (S{season_num}E{episode_num}) is now ready to go. Enjoy!",
            f"Go JellyDad! {series} - {name} (Season {season_num}, Episode {episode_num}) is here."
        ]
        subject = f"Jellydad: {series}"
    else:
        messages = [
            f"Oh Yeah! The movie '{name}' just dropped on JellyDad.",
            f"Hey JellyDad here! '{name}' is now ready to go. Grab the popcorn!",
            f"Go JellyDad! '{name}' is here."
        ]
        subject = f"Jellydad: {name}"

    body = random.choice(messages)
    
    msg = MIMEText(body)
    msg['Subject'] = subject
    msg['From'] = f"Jellydad <{SMTP_USER}>"
    msg['To'] = recipient

    try:
        with smtplib.SMTP(SMTP_SERVER, SMTP_PORT) as server:
            server.starttls()
            server.login(SMTP_USER, SMTP_PASS)
            server.send_message(msg)
        log_it(f"Jellydad notification sent to {recipient}")
    except Exception as e:
        log_it(f"Error sending email: {e}")

@app.route('/jellyfin-webhook', methods=['POST'])
def webhook():
    raw_str = request.data.decode('utf-8')
    
    try:
        data = json.loads(raw_str)
    except Exception as e:
        log_it(f"Jellydad error parsing raw data: {e}")
        return "Invalid JSON", 400

    # 1. Filter out everything that isn't a new addition
    notification_type = data.get('NotificationType', '')
    if notification_type and notification_type != "ItemAdded":
        log_it(f"Jellydad ignored event type: {notification_type}")
        return "OK", 200

    item_name = data.get('Name', 'Unknown Item')
    item_id = data.get('ItemId', '')
    series_id = data.get('SeriesId', '')
    is_tv = bool(data.get('SeriesName'))
    
    log_it(f"Jellydad raw data received for: {item_name}")
    
    # 2. Create a unique identifier for this specific media (ignores the file path/ID)
    if is_tv:
        media_uid = f"{data.get('SeriesName')}_S{data.get('SeasonNumber','0')}E{data.get('EpisodeNumber','0')}"
    else:
        media_uid = item_name

    def clean_tags(val):
        if not val: return []
        if isinstance(val, list): return [str(v).strip() for v in val]
        return [t.strip() for t in str(val).split(',') if t.strip()]

    tags = clean_tags(data.get('Tags', '')) + clean_tags(data.get('SeriesTags', ''))
    
    if item_id:
        tags.extend(get_tags_from_api(item_id))
    if series_id:
        tags.extend(get_tags_from_api(series_id))

    seerr_user = data.get('requestedBy_username')
    if seerr_user:
        tags.append(seerr_user)

    final_tags = set()
    for tag in tags:
        if tag in SEERR_USER_MAP:
            final_tags.add(SEERR_USER_MAP[tag])
        else:
            final_tags.add(tag)

    history = load_history()
    sent_count = 0
    
    for tag in final_tags:
        if tag in NOTIFY_MAP:
            recipient = NOTIFY_MAP[tag]
            # Combine the recipient and media to create a unique history entry
            history_key = f"{recipient}::{media_uid}"
            
            if history_key in history:
                log_it(f"Jellydad: Already notified {recipient} about {media_uid}. Skipping.")
                continue
                
            send_notification(recipient, data)
            history.append(history_key)
            sent_count += 1
            
            # Keep history file from growing infinitely (stores the last 2000 notifications)
            if len(history) > 2000:
                history = history[-2000:]
                
            save_history(history)
    
    if sent_count == 0:
        log_it("Jellydad: No matching tags found or already notified, skipping notification.")

    return "OK", 200

if __name__ == '__main__':
    log_it("Jellydad starting up...")
    app.run(host='0.0.0.0', port=5000)