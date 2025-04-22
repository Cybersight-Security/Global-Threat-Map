document.addEventListener('DOMContentLoaded', () => {
    const svg = d3.select('#map')
        .append('svg')
        .attr('width', '100%')
        .attr('height', '100%');

    const g = svg.append('g');
    const attacksGroup = svg.append('g').attr('class', 'attacks');
    const tooltip = d3.select('#tooltip');
    const datasetSelect = document.getElementById('dataset-select');
    const activityFeed = document.getElementById('activity-feed-content');
    let totalThreats = 0;
    let activeSources = new Set();
    let activeAttacks = 0;
    let geoData = {};
    let width = window.innerWidth;
    let height = window.innerHeight;
    let pingInterval;
    let apiRequestInterval;
    let attackInterval;
    let currentDataset = 'all_threats.json'; // Set default to all threats

    // Load details from details.json
    fetch('https://raw.githubusercontent.com/Cybersight-Security/Global-Threat-Map/refs/heads/main/assets/details.json')
        .then(response => response.json())
        .then(data => {
            document.getElementById('total-ips').textContent = data.total_unique_ips.toLocaleString();

            // Update stats with dataset-specific counts
            for (const [dataset, count] of Object.entries(data.total_ips_per_list)) {
                const option = document.querySelector(`#dataset-select option[value="${dataset}.json"]`);
                if (option) {
                    option.textContent += ` (${count.toLocaleString()})`;
                }
            }
        })
        .catch(error => {
            console.error('Error loading details:', error);
        });

    // Track visible pings for attack animations
    let visiblePings = [];
    const MAX_VISIBLE_PINGS = 100; // Maximum number of pings to show at once

    // Track active attack paths
    let activeAttackPaths = [];

    // Mapping of datasets to ping classes
    const datasetToPingClass = {
        'firehol_level1.json': 'ping-level1',
        'firehol_level2.json': 'ping-level2',
        'firehol_level3.json': 'ping-level3',
        'firehol_anonymous.json': 'ping-anonymous',
        'firehol_webclient.json': 'ping-webclient',
        'firehol_abusers_30d.json': 'ping-abusers-30d',
        'firehol_abusers_1d.json': 'ping-abusers-1d',
        'firehol_webserver.json': 'ping-webserver'
    };

    // Dataset color mapping for all_threats option
    const datasetColors = {
        'firehol_level1.json': '#ff3232',
        'firehol_level2.json': '#ffa500',
        'firehol_level3.json': '#ffff00',
        'firehol_anonymous.json': '#8a2be2',
        'firehol_webclient.json': '#00bfff',
        'firehol_abusers_30d.json': '#32cd32',
        'firehol_abusers_1d.json': '#db7093',
        'firehol_webserver.json': '#ff7f50'
    };

    // API request queue and processing state
    let apiQueue = [];
    let isProcessingBatch = false;
    let allDatasetsLoaded = false;
    let allDatasets = {};

    // Create world map projection
    const projection = d3.geoMercator()
        .scale((width + 1) / 2 / Math.PI)
        .translate([width / 2, height / 1.5]);

    const path = d3.geoPath().projection(projection);

    // Add glow filter to SVG defs
    const defs = svg.append('defs');
    const glowFilter = defs.append('filter')
        .attr('id', 'glow')
        .attr('x', '-50%')
        .attr('y', '-50%')
        .attr('width', '200%')
        .attr('height', '200%');

    glowFilter.append('feGaussianBlur')
        .attr('stdDeviation', '2.5')
        .attr('result', 'coloredBlur');

    const feMerge = glowFilter.append('feMerge');
    feMerge.append('feMergeNode')
        .attr('in', 'coloredBlur');
    feMerge.append('feMergeNode')
        .attr('in', 'SourceGraphic');

    // Load and render world map
    d3.json('https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json')
        .then(data => {
            const countries = topojson.feature(data, data.objects.countries);

            g.selectAll('path')
                .data(countries.features)
                .enter()
                .append('path')
                .attr('class', 'country')
                .attr('d', path)
                .on('mouseover', function(event, d) {
                    const countryName = d.properties.name;
                    tooltip.style('opacity', 1)
                        .html(countryName)
                        .style('left', (event.pageX + 10) + 'px')
                        .style('top', (event.pageY - 25) + 'px');
                })
                .on('mouseout', function() {
                    tooltip.style('opacity', 0);
                });

            // After map is loaded, start fetching threat data
            loadDataset(currentDataset);
        })
        .catch(error => {
            console.error('Error loading map data:', error);
            document.getElementById('loading').innerHTML = 'Error loading map data. Please refresh and try again.';
        });

    // Dataset selection handler
    datasetSelect.addEventListener('change', (e) => {
        currentDataset = e.target.value;
        document.getElementById('loading').style.display = 'flex';
        document.querySelector('.loading-text').textContent = 'Loading Data';
        resetVisualization();
        loadDataset(currentDataset);
    });

    // Resize handler
    window.addEventListener('resize', () => {
        width = window.innerWidth;
        height = window.innerHeight;

        projection
            .scale((width + 1) / 2 / Math.PI)
            .translate([width / 2, height / 1.5]);

        g.selectAll('path').attr('d', path);

        // Reposition any active attack paths
        repositionAttackPaths();
    });

    // Reset visualization when changing datasets
    function resetVisualization() {
        // Clear existing pings
        document.querySelectorAll('.ping').forEach(ping => ping.remove());

        // Clear attack paths
        attacksGroup.selectAll('path').remove();
        activeAttackPaths = [];

        // Reset counters
        totalThreats = 0;
        activeSources = new Set();
        activeAttacks = 0;
        visiblePings = [];
        geoData = {};
        apiQueue = [];

        document.getElementById('total-count').textContent = totalThreats;
        document.getElementById('active-sources').textContent = activeSources.size;

        // Clear activity feed
        activityFeed.innerHTML = '';

        // Clear any existing intervals
        if (pingInterval) {
            clearInterval(pingInterval);
            pingInterval = null;
        }

        if (apiRequestInterval) {
            clearInterval(apiRequestInterval);
            apiRequestInterval = null;
        }

        if (attackInterval) {
            clearInterval(attackInterval);
            attackInterval = null;
        }
    }

    // Load dataset from local JSON file
    async function loadDataset(datasetFile) {
        document.getElementById('loading').style.display = 'flex'; // Show loading screen

        try {
            if (datasetFile === 'all_threats.json') {
                if (!allDatasetsLoaded) {
                    // Load all datasets
                    await loadAllDatasets();
                    allDatasetsLoaded = true;
                }

                // Combine IPs from all datasets
                let combinedIPs = [];
                for (const [dataset, data] of Object.entries(allDatasets)) {
                    // Add dataset source to each IP
                    const ipsWithSource = data.ips.map(ip => ({
                        ip,
                        source: dataset
                    }));
                    combinedIPs = combinedIPs.concat(ipsWithSource);
                }

                // Shuffle the combined IPs for random selection
                shuffleArray(combinedIPs);

                // Initialize the API queue with all IPs
                apiQueue = combinedIPs;

                // Start API request interval
                startApiRequests();

                // Start ping animation to display results
                startPingAnimation();

                // Start attack animation
                startAttackAnimation();

            } else {
                const response = await fetch(`https://raw.githubusercontent.com/Cybersight-Security/Global-Threat-Map/refs/heads/main/data/${datasetFile}`);
                const data = await response.json();

                // Initialize the API queue with all IPs
                apiQueue = data.ips.map(ip => ({
                    ip,
                    source: datasetFile
                }));

                // Start API request interval
                startApiRequests();

                // Start ping animation to display results
                startPingAnimation();

                // Start attack animation
                startAttackAnimation();
            }

            // We'll track whether the first pings have been displayed in a variable
            let firstPingsDisplayed = false;

            // Set up an interval to check if pings are being displayed
            const loadingCheckInterval = setInterval(() => {
                if (visiblePings.length > 0 && !firstPingsDisplayed) {
                    // We have pings on the map, hide the loading screen
                    document.getElementById('loading').style.display = 'none';
                    firstPingsDisplayed = true;
                    clearInterval(loadingCheckInterval); // Stop checking
                }
            }, 100); // Check every 100ms

            // Set a maximum timeout to hide the loading screen if no pings appear
            setTimeout(() => {
                if (!firstPingsDisplayed) {
                    document.getElementById('loading').style.display = 'none';
                    clearInterval(loadingCheckInterval);
                }
            }, 15000); // 15-second maximum loading time

        } catch (error) {
            console.error('Error loading dataset:', error);
            document.getElementById('loading').innerHTML = 'Error loading dataset. Please refresh and try again.';
            // Hide the loading screen after error message
            setTimeout(() => {
                document.getElementById('loading').style.display = 'none';
            }, 3000);
        }
    }

    // Load all datasets for the "All Threats" option
    async function loadAllDatasets() {
        const datasets = Object.keys(datasetToPingClass);

        for (const dataset of datasets) {
            try {
                const response = await fetch(`https://raw.githubusercontent.com/Cybersight-Security/Global-Threat-Map/refs/heads/main/data/${dataset}`);
                const data = await response.json();
                allDatasets[dataset] = data;
            } catch (error) {
                console.error(`Error loading dataset ${dataset}:`, error);
            }
        }
    }

    // Shuffle array function (Fisher-Yates algorithm)
    function shuffleArray(array) {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
        return array;
    }

    // Start making API requests at regular intervals, evenly distributed over a minute
    function startApiRequests() {
        // 10 requests per minute = 1 request every 6 seconds
        const requestsPerMinute = 10;
        const intervalMs = (60 * 1000) / requestsPerMinute; // Evenly distribute 10 requests over a minute
        const batchSize = 100; // 100 IPs per request = 1000 IPs per minute

        apiRequestInterval = setInterval(() => {
            if (apiQueue.length > 0 && !isProcessingBatch) {
                const batch = apiQueue.splice(0, batchSize);
                processIpBatch(batch);
            } else if (apiQueue.length === 0) {
                // All IPs have been queued for processing
                clearInterval(apiRequestInterval);
            }
        }, intervalMs);
    }

    // Process IP batch with geolocation from ip-api
    async function processIpBatch(ipBatch) {
        if (ipBatch.length === 0) return;

        try {
            isProcessingBatch = true;

            // Extract IP addresses from batch objects
            const ipAddresses = ipBatch.map(item => item.ip);

            // Use ip-api batch request (free tier allows up to 100 IPs per request)
            // Documentation: https://ip-api.com/docs/api:batch
            const requestUrl = 'http://ip-api.com/batch';
            const requestData = ipAddresses.map(ip => ({
                query: ip,
                fields: 'status,query,country,city,lat,lon,isp'
            }));

            const response = await fetch(requestUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(requestData)
            });

            if (!response.ok) {
                throw new Error(`API request failed with status: ${response.status}`);
            }

            const geoResults = await response.json();

            // Store results and process for display
            geoResults.forEach((result, index) => {
                if (result.status === 'success') {
                    const ip = result.query;
                    const sourceBatch = ipBatch.find(item => item.ip === ip);
                    const source = sourceBatch ? sourceBatch.source : currentDataset;

                    geoData[ip] = {
                        lat: result.lat,
                        lon: result.lon,
                        country: result.country,
                        city: result.city,
                        isp: result.isp,
                        source: source,
                        processed: false
                    };
                    activeSources.add(ip);
                }
            });

            // Update stats
            document.getElementById('active-sources').textContent = activeSources.size;
            isProcessingBatch = false;
        } catch (error) {
            console.error('Error processing IP batch:', error);
            isProcessingBatch = false;
        }
    }

    // Start ping animation to display threat locations
    function startPingAnimation() {
        pingInterval = setInterval(() => {
            // Process 10-20 pings per interval
            const pingsToProcess = Math.min(Math.floor(Math.random() * 10) + 10, Object.keys(geoData).length);

            for (let i = 0; i < pingsToProcess; i++) {
                const ip = Object.keys(geoData)[Math.floor(Math.random() * Object.keys(geoData).length)];
                const data = geoData[ip];

                if (data && !data.processed) {
                    createPing(data, ip);
                    data.processed = true;
                    totalThreats++;
                    document.getElementById('total-count').textContent = totalThreats;

                    // Add to activity feed
                    addToActivityFeed(ip, data, false);
                }
            }

            // Remove oldest pings if we've reached the maximum
            while (visiblePings.length > MAX_VISIBLE_PINGS) {
                const oldestPing = visiblePings.shift();
                if (oldestPing && oldestPing.element) {
                    // Remove the ping element
                    oldestPing.element.remove();

                    // Remove any attack paths associated with this ping
                    removeAttackPathsForPing(oldestPing);
                }
            }
        }, 500);
    }

    // Create a ping element on the map
    function createPing(data, ip) {
        const [x, y] = projection([data.lon, data.lat]);

        if (!x || !y) return;

        const pingClass = datasetToPingClass[data.source] || 'ping-level1';
        const pingColor = datasetColors[data.source] || '#ff3232';

        const ping = document.createElement('div');
        ping.className = `ping ${pingClass}`;
        ping.style.left = `${x}px`;
        ping.style.top = `${y}px`;
        ping.style.boxShadow = `0 0 10px 2px ${pingColor}80`;
        ping.dataset.ip = ip;

        ping.addEventListener('mouseover', (e) => {
            tooltip.style('opacity', 1)
                .html(`<strong>IP:</strong> ${ip}<br>
                       <strong>Location:</strong> ${data.city}, ${data.country}<br>
                       <strong>ISP:</strong> ${data.isp}`)
                .style('left', (e.pageX + 10) + 'px')
                .style('top', (e.pageY - 25) + 'px');
        });

        ping.addEventListener('mouseout', () => {
            tooltip.style('opacity', 0);
        });

        document.getElementById('map').appendChild(ping);
        visiblePings.push({
            element: ping,
            x,
            y,
            timestamp: Date.now(),
            id: Date.now() + '-' + Math.random().toString(36).substr(2, 9) // Unique ID for the ping
        });
    }

    // Add an entry to the activity feed
    function addToActivityFeed(ip, data, isAttack) {
        const now = new Date();
        const timeString = now.toLocaleTimeString();

        const feedItem = document.createElement('div');
        feedItem.className = `activity-item ${isAttack ? 'attack' : ''}`;

        const locationText = data.city ? `${data.city}, ${data.country}` : data.country || 'Unknown location';
        const threatType = getThreatTypeFromSource(data.source);

        feedItem.innerHTML = `
            <div>
                <span class="ip">${ip}</span>
                <span class="location">${locationText}</span>
            </div>
            <div>
                <span class="threat-type">${threatType}</span>
                <span class="time">${timeString}</span>
            </div>
        `;

        activityFeed.appendChild(feedItem);

        // Auto-scroll to bottom
        activityFeed.scrollTop = activityFeed.scrollHeight;

        // Limit to 50 items
        if (activityFeed.children.length > 50) {
            activityFeed.removeChild(activityFeed.children[0]);
        }
    }

    // Get threat type from source filename
    function getThreatTypeFromSource(source) {
        const map = {
            'firehol_level1.json': 'High Risk',
            'firehol_level2.json': 'Moderate Risk',
            'firehol_level3.json': 'Low Risk',
            'firehol_anonymous.json': 'Anonymous Proxy',
            'firehol_webclient.json': 'Web Client',
            'firehol_abusers_30d.json': '30-Day Abuser',
            'firehol_abusers_1d.json': '24-Hour Abuser',
            'firehol_webserver.json': 'Web Server Threat'
        };
        return map[source] || 'Threat';
    }

    // Start attack animation between random pings with randomized intervals
    function startAttackAnimation() {
        // Main interval to schedule attack creation
        attackInterval = setInterval(() => {
            if (visiblePings.length < 2) return;

            // Schedule a new attack with random delay
            scheduleNextAttack();

        }, 500); // Check every half second if we should create new attacks
    }

    // Schedule next attack with random delay
    function scheduleNextAttack() {
        // Random delay between 100ms and 1500ms
        const delay = Math.random() * 1400 + 100;

        setTimeout(() => {
            if (visiblePings.length < 2) return;

            // Create a single attack path
            createAttackPath();

            // Clean up any orphaned attack paths
            cleanupAttackPaths();

            // 60% chance to schedule another attack immediately
            if (Math.random() < 0.6) {
                scheduleNextAttack();
            }
        }, delay);
    }

    // Create an attack path between two random pings
    function createAttackPath() {
        const ping1 = visiblePings[Math.floor(Math.random() * visiblePings.length)];
        const ping2 = visiblePings[Math.floor(Math.random() * visiblePings.length)];

        if (!ping1 || !ping2 || ping1 === ping2) return;

        const pathId = `attack-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

        // Determine attack duration (between 1.5 and 3.5 seconds)
        const attackDuration = Math.random() * 2000 + 1500;

        // Calculate path control points for a more natural curve
        const dx = ping2.x - ping1.x;
        const dy = ping2.y - ping1.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        // Random curve intensity
        const curveHeight = Math.min(dist * 0.3, 80) * (Math.random() * 0.4 + 0.8);

        // Perpendicular vector for control point
        const nx = -dy / dist;
        const ny = dx / dist;

        // Control point coordinates (perpendicular to the midpoint)
        const cpx = (ping1.x + ping2.x) / 2 + nx * curveHeight;
        const cpy = (ping1.y + ping2.y) / 2 + ny * curveHeight;

        // Randomize the attack line appearance
        const attackColor = `hsl(${Math.random() < 0.7 ? 180 : 120 + Math.random() * 60}, 100%, ${50 + Math.random() * 25}%)`;
        const attackWidth = 1.5 + Math.random() * 1;
        const attackType = Math.random() > 0.5 ? 'pulse' : 'wave';

        // Create attack path with a gradient
        const gradientId = `gradient-${pathId}`;
        const gradient = attacksGroup.append("linearGradient")
            .attr("id", gradientId)
            .attr("gradientUnits", "userSpaceOnUse")
            .attr("x1", ping1.x)
            .attr("y1", ping1.y)
            .attr("x2", ping2.x)
            .attr("y2", ping2.y);

        gradient.append("stop")
            .attr("offset", "0%")
            .attr("stop-color", attackColor);

        gradient.append("stop")
            .attr("offset", "100%")
            .attr("stop-color", `hsl(${180 + Math.random() * 60}, 100%, 70%)`);

        // The actual path
        const path = attacksGroup.append('path')
            .attr('id', pathId)
            .attr('d', `M${ping1.x},${ping1.y} Q${cpx},${cpy} ${ping2.x},${ping2.y}`)
            .attr('class', `attack-path attack-${attackType}`)
            .attr('stroke', `url(#${gradientId})`)
            .attr('stroke-width', attackWidth)
            .attr('fill', 'none')
            .attr('opacity', 0)
            .transition()
            .duration(300)
            .attr('opacity', 0.8);

        // Store the attack path info
        activeAttackPaths.push({
            id: pathId,
            sourcePingId: ping1.id,
            targetPingId: ping2.id,
            element: path,
            createdAt: Date.now(),
            duration: attackDuration,
            gradientId: gradientId
        });

        activeAttacks++;

        // Add to activity feed
        const ip1 = ping1.element.dataset.ip;
        const ip2 = ping2.element.dataset.ip;
        const data1 = geoData[ip1];
        const data2 = geoData[ip2];

        if (data1 && data2) {
            addToActivityFeed(`${ip1} → ${ip2}`, data1, true);
        }

        // Remove the path after animation completes
        setTimeout(() => {
            // Find the attack path in our array
            const pathIndex = activeAttackPaths.findIndex(p => p.id === pathId);
            if (pathIndex !== -1) {
                // Remove from our tracking array
                activeAttackPaths.splice(pathIndex, 1);

                // Remove associated gradient
                d3.select(`#${gradientId}`).remove();

                // Animate and remove from DOM
                d3.select(`#${pathId}`)
                    .transition()
                    .duration(300)
                    .attr('opacity', 0)
                    .remove();

                activeAttacks--;
            }
        }, attackDuration);
    }

    // Remove attack paths associated with a specific ping
    function removeAttackPathsForPing(ping) {
        if (!ping || !ping.id) return;

        // Find all attack paths connected to this ping
        const pathsToRemove = activeAttackPaths.filter(
            path => path.sourcePingId === ping.id || path.targetPingId === ping.id
        );

        // Remove each path
        pathsToRemove.forEach(path => {
            // Remove from DOM with fade out animation
            d3.select(`#${path.id}`)
                .transition()
                .duration(200)
                .attr('opacity', 0)
                .remove();

            // Remove gradient
            d3.select(`#${path.gradientId}`).remove();

            // Remove from our tracking array
            const pathIndex = activeAttackPaths.findIndex(p => p.id === path.id);
            if (pathIndex !== -1) {
                activeAttackPaths.splice(pathIndex, 1);
                activeAttacks--;
            }
        });
    }

    // Clean up any attack paths that are older than their duration
    function cleanupAttackPaths() {
        const now = Date.now();
        const expiredPaths = activeAttackPaths.filter(path => now - path.createdAt > path.duration);

        expiredPaths.forEach(path => {
            // Remove from DOM with fade out
            d3.select(`#${path.id}`)
                .transition()
                .duration(200)
                .attr('opacity', 0)
                .remove();

            // Remove gradient
            d3.select(`#${path.gradientId}`).remove();

            // Remove from our tracking array
            const pathIndex = activeAttackPaths.findIndex(p => p.id === path.id);
            if (pathIndex !== -1) {
                activeAttackPaths.splice(pathIndex, 1);
                activeAttacks--;
            }
        });

        // Also check for attack paths whose pings no longer exist
        const visiblePingIds = new Set(visiblePings.map(ping => ping.id));
        const orphanedPaths = activeAttackPaths.filter(
            path => !visiblePingIds.has(path.sourcePingId) || !visiblePingIds.has(path.targetPingId)
        );

        orphanedPaths.forEach(path => {
            // Remove from DOM with fade out
            d3.select(`#${path.id}`)
                .transition()
                .duration(200)
                .attr('opacity', 0)
                .remove();

            // Remove gradient
            d3.select(`#${path.gradientId}`).remove();

            // Remove from our tracking array
            const pathIndex = activeAttackPaths.findIndex(p => p.id === path.id);
            if (pathIndex !== -1) {
                activeAttackPaths.splice(pathIndex, 1);
                activeAttacks--;
            }
        });
    }

    // Reposition attack paths when window is resized
    function repositionAttackPaths() {
        // Update position data for all visible pings
        visiblePings.forEach(ping => {
            const data = geoData[ping.element.dataset.ip];
            if (data) {
                const [x, y] = projection([data.lon, data.lat]);
                ping.element.style.left = `${x}px`;
                ping.element.style.top = `${y}px`;
                ping.x = x;
                ping.y = y;
            }
        });

        // Update all active attack paths to match new ping positions
        const visiblePingMap = new Map(visiblePings.map(ping => [ping.id, ping]));

        activeAttackPaths.forEach(path => {
            const sourcePing = visiblePingMap.get(path.sourcePingId);
            const targetPing = visiblePingMap.get(path.targetPingId);

            if (sourcePing && targetPing) {
                // Calculate new control point
                const dx = targetPing.x - sourcePing.x;
                const dy = targetPing.y - sourcePing.y;
                const dist = Math.sqrt(dx * dx + dy * dy);

                // Maintain the curve height relative to distance
                const curveHeight = Math.min(dist * 0.3, 80);

                // Perpendicular vector for control point
                const nx = -dy / dist;
                const ny = dx / dist;

                // Control point coordinates
                const cpx = (sourcePing.x + targetPing.x) / 2 + nx * curveHeight;
                const cpy = (sourcePing.y + targetPing.y) / 2 + ny * curveHeight;

                // Update path with new coordinates
                d3.select(`#${path.id}`)
                    .attr('d', `M${sourcePing.x},${sourcePing.y} Q${cpx},${cpy} ${targetPing.x},${targetPing.y}`);

                // Update gradient coordinates if it exists
                d3.select(`#${path.gradientId}`)
                    .attr("x1", sourcePing.x)
                    .attr("y1", sourcePing.y)
                    .attr("x2", targetPing.x)
                    .attr("y2", targetPing.y);
            } else {
                // If either ping is missing, remove the path
                d3.select(`#${path.id}`).remove();
                d3.select(`#${path.gradientId}`).remove();

                const pathIndex = activeAttackPaths.findIndex(p => p.id === path.id);
                if (pathIndex !== -1) {
                    activeAttackPaths.splice(pathIndex, 1);
                    activeAttacks--;
                }
            }
        });
    }
});