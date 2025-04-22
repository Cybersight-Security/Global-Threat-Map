<div align="center">

# Global Threat Map

![Cybersight Security Global Threat Map](assets/logo.png)

The Cybersight Security Global Threat Map is an interactive visualization tool that displays potential cybersecurity threats around the world using real IP data from FireHOL threat intelligence feeds. The map provides security professionals and the general public with a compelling visualization of global cyber threat activity.

</div>

## Features:
- Displays real IP addresses from multiple FireHOL threat intelligence lists
- Shows geolocation data for each threat (when available)
- Visualizes simulated attack patterns between threat sources
- Provides detailed threat information on hover
- Includes an activity feed showing recent threat detections
- Allows filtering by different threat categories

**Important Note:** While the IP addresses and their locations are real (sourced from FireHOL threat lists), the attack animations between points are simulated for visualization purposes and do not represent actual attacks.

## Data Sources

The application uses the following FireHOL threat intelligence feeds:

- FireHOL Level 1 (High Risk Threats)
- FireHOL Level 2 (Moderate Risk Threats)
- FireHOL Level 3 (Low Risk Threats)
- Anonymous Proxies
- Malicious Web Clients
- 30-Day Abusers
- 24-Hour Abusers
- Web Server Threats

Geolocation data is obtained using the ip-api.com service.

## Technical Implementation

### Backend Components

- **FireHOL List Fetcher (`FireHOL-List-Fetcher.py`):**
  - Downloads and processes threat lists from FireHOL
  - Stores IP data in JSON format
  - Maintains statistics about threat counts
  - Updates automatically when run

### Frontend Components

- **Interactive World Map:**
  - Built with D3.js and TopoJSON
  - Displays countries with hover effects
  - Shows threat locations as animated "pings"

- **Threat Visualization:**
  - Color-coded pings based on threat type
  - Simulated attack paths between random threats
  - Dynamic activity feed showing recent detections

- **User Interface:**
  - Responsive design that works on various screen sizes
  - Dataset selector to filter by threat type
  - Real-time statistics display
  - Loading screen during data processing

## Installation and Usage

### Requirements

- Python 3.x (for the data fetcher)
- Node.js/npm (for development)
- Modern web browser (Chrome, Firefox, Edge recommended)

### Setup Instructions

1. **Clone the repository:**
   ```bash
   git clone https://github.com/cybersight/global-threat-map.git
   cd global-threat-map
   ```

2. **Install Python dependencies:**
   ```bash
   pip install requests
   ```

3. **Run the data fetcher:**
   ```bash
   python FireHOL-List-Fetcher.py
   ```

4. **Serve the application:**
   - For development, you can use any static file server:
     ```bash
     python -m http.server 8000
     ```
   - Then open `http://localhost:8000` in your browser

5. **For production:**
   - Deploy the entire directory to your web server
   - Set up a cron job to regularly run the data fetcher

## Configuration

You can customize the following aspects of the application:

- **Data Sources:** Modify the `URLS` dictionary in `FireHOL-List-Fetcher.py` to add or remove threat lists
- **Visual Style:** Adjust colors and animations in `styles.css`
- **Behavior:** Modify animation timing and frequency in `script.js`

## License

This project is licensed under the GNU General Public License (GPL). This means you are free to:

- Use the software for any purpose
- Study how the software works and modify it
- Distribute copies
- Distribute modified versions

The full license text is included in the repository.

## About Cybersight Security

Cybersight Security is a leading provider of cybersecurity solutions, helping organizations protect their digital assets against evolving threats. Our Global Threat Map is part of our commitment to security awareness and education.

**Disclaimer:** This tool is for informational purposes only. The simulated attack visualizations are not real-time threat data but are based on known malicious IP addresses. Cybersight Security makes no warranties about the completeness or accuracy of the data presented.