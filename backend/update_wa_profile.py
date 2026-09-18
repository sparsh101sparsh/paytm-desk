"""
Utility script to update WhatsApp Business Profile Picture using Meta Resumable Upload API.
Reads WHATSAPP_TOKEN and WHATSAPP_PHONE_NUMBER_ID from .env and uploads public/icon.png.
"""
import os
import sys
from pathlib import Path
import httpx

ROOT_DIR = Path(__file__).resolve().parent.parent

def update_whatsapp_profile_picture(icon_path: str = None):
    # Load .env
    env = {}
    env_file = ROOT_DIR / ".env"
    if env_file.exists():
        with open(env_file) as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    k, v = line.split("=", 1)
                    env[k.strip()] = v.strip()

    token = os.getenv("WHATSAPP_TOKEN") or env.get("WHATSAPP_TOKEN")
    phone_id = os.getenv("WHATSAPP_PHONE_NUMBER_ID") or env.get("WHATSAPP_PHONE_NUMBER_ID")

    if not token or not phone_id:
        print("Error: WHATSAPP_TOKEN or WHATSAPP_PHONE_NUMBER_ID not set.")
        return False

    if not icon_path:
        icon_path = str(ROOT_DIR / "public" / "icon.png")

    with open(icon_path, "rb") as f:
        file_bytes = f.read()

    file_length = len(file_bytes)

    # 1. Fetch App ID
    debug_res = httpx.get(f"https://graph.facebook.com/debug_token?input_token={token}&access_token={token}")
    if debug_res.status_code != 200:
        print("Error inspecting token:", debug_res.text)
        return False
    app_id = debug_res.json().get("data", {}).get("app_id")

    # 2. Start upload session
    upload_res = httpx.post(
        f"https://graph.facebook.com/v20.0/{app_id}/uploads",
        params={
            "file_length": file_length,
            "file_type": "image/png",
            "access_token": token
        }
    )
    if upload_res.status_code != 200:
        print("Error starting upload session:", upload_res.text)
        return False
    upload_session_id = upload_res.json().get("id")

    # 3. Upload binary
    chunk_res = httpx.post(
        f"https://graph.facebook.com/v20.0/{upload_session_id}",
        headers={
            "Authorization": f"OAuth {token}",
            "file_offset": "0",
            "Content-Type": "application/octet-stream"
        },
        content=file_bytes
    )
    if chunk_res.status_code != 200:
        print("Error uploading file chunk:", chunk_res.text)
        return False
    handle = chunk_res.json().get("h")

    # 4. Update Profile Picture Handle
    profile_res = httpx.post(
        f"https://graph.facebook.com/v20.0/{phone_id}/whatsapp_business_profile",
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json"
        },
        json={
            "messaging_product": "whatsapp",
            "profile_picture_handle": handle
        }
    )
    if profile_res.status_code == 200:
        print("Successfully updated WhatsApp Business Profile picture!")
        return True
    else:
        print("Error updating profile:", profile_res.text)
        return False

if __name__ == "__main__":
    path_arg = sys.argv[1] if len(sys.argv) > 1 else None
    update_whatsapp_profile_picture(path_arg)
