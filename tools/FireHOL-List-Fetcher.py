import os
import json
import requests
from datetime import datetime

# URLs for the FireHOL lists
URLS = {
    "firehol_level1": "https://iplists.firehol.org/files/firehol_level1.netset",
    "firehol_level2": "https://iplists.firehol.org/files/firehol_level2.netset",
    "firehol_level3": "https://iplists.firehol.org/files/firehol_level3.netset",
    "firehol_anonymous": "https://iplists.firehol.org/files/firehol_anonymous.netset",
    "firehol_webclient": "https://iplists.firehol.org/files/firehol_webclient.netset",
    "firehol_abusers_30d": "https://iplists.firehol.org/files/firehol_abusers_30d.netset",
    "firehol_abusers_1d": "https://iplists.firehol.org/files/firehol_abusers_1d.netset",
    "firehol_webserver": "https://iplists.firehol.org/files/firehol_webserver.netset",
}

# Directory paths
DATA_DIR = "../data/"
ASSETS_DIR = "../assets/"

# Ensure the directories exist
os.makedirs(DATA_DIR, exist_ok=True)
os.makedirs(ASSETS_DIR, exist_ok=True)

# Dictionary to track IP stats
ip_stats = {}
all_unique_ips = set()


def fetch_and_update_list(url, list_name):
    """Download the IP list, parse it, and replace the JSON file."""
    print(f"Downloading {list_name}...")

    try:
        response = requests.get(url)
        response.raise_for_status()

        # Process the response content to extract IPs
        content = response.text.splitlines()
        ip_list = []

        for line in content:
            # Skip comments and empty lines
            line = line.strip()
            if line and not line.startswith("#"):
                ip_list.append(line)

    except requests.RequestException as e:
        print(f"Error downloading {list_name}: {e}")
        return

    json_file_path = os.path.join(DATA_DIR, f"{list_name}.json")

    # Count how many IPs were in the old list if it exists
    old_count = 0
    if os.path.exists(json_file_path):
        try:
            with open(json_file_path, "r") as file:
                old_data = json.load(file)
                old_count = len(old_data.get("ips", []))
        except json.JSONDecodeError:
            print(f"Error reading existing file {json_file_path}, will create new file")

    # Replace with new IPs
    with open(json_file_path, "w") as file:
        json.dump({"ips": ip_list}, file, indent=4)

    # Report changes
    new_count = len(ip_list)
    print(f"Updated {list_name}: {old_count} IPs -> {new_count} IPs")
    if old_count > new_count:
        print(f"  Removed {old_count - new_count} IPs")
    elif new_count > old_count:
        print(f"  Added {new_count - old_count} IPs")
    else:
        print("  No change in IP count")

    # Update statistics
    ip_stats[list_name] = new_count
    all_unique_ips.update(ip_list)


def save_details():
    """Save a summary file and a list of all IPs."""
    details = {
        "total_ips_per_list": ip_stats,
        "total_unique_ips": len(all_unique_ips),
        "last_updated": datetime.utcnow().isoformat() + "Z",
    }

    # Save details.json in the assets folder
    details_path = os.path.join(ASSETS_DIR, "details.json")
    with open(details_path, "w") as f:
        json.dump(details, f, indent=4)
    print("details.json updated.")

    # Save all_threats.json in the data folder
    threats_path = os.path.join(DATA_DIR, "all_threats.json")
    with open(threats_path, "w") as f:
        json.dump({"ips": list(all_unique_ips)}, f, indent=4)
    print(f"all_threats.json created with {len(all_unique_ips)} unique IPs.")


def main():
    for list_name, url in URLS.items():
        fetch_and_update_list(url, list_name)
    save_details()


if __name__ == "__main__":
    main()
