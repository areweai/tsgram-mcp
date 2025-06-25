# Signal Requirements

## Current Mock Implementation

Our REST server currently **mocks** Signal messaging:
```javascript
// Mock Signal message sending
console.log(`[SIGNAL MOCK] To: ${recipient}, Message: ${message}`);
```

**What's Missing:** Actual Signal daemon connection and real message sending.

## Required Components for Real Signal Integration

### 1. Signal Tools Installation

#### Option A: signal-cli (Native Installation)
**macOS:**
```bash
# Install via Homebrew
brew install signal-cli

# Or download JAR directly
wget https://github.com/AsamK/signal-cli/releases/latest/download/signal-cli-X.X.X.tar.gz
tar -xzf signal-cli-X.X.X.tar.gz
export PATH="$PATH:$(pwd)/signal-cli-X.X.X/bin"
```

**Linux (Ubuntu/Debian):**
```bash
# Install Java 17+ (required)
sudo apt update
sudo apt install openjdk-17-jre

# Download and install signal-cli
wget https://github.com/AsamK/signal-cli/releases/latest/download/signal-cli-X.X.X-Linux.tar.gz
sudo tar -xzf signal-cli-X.X.X-Linux.tar.gz -C /opt/
sudo ln -sf /opt/signal-cli-X.X.X/bin/signal-cli /usr/local/bin/signal-cli
```

**Docker (Recommended):**
```bash
# Pull signal-cli Docker image
docker pull asamk/signal-cli

# Or use signal-cli-rest-api (includes HTTP API)
docker pull bbernhard/signal-cli-rest-api
```

#### Option B: Alternative Tools
- **signal-cli-rest-api**: Docker container providing HTTP API
- **signald**: Signal daemon (alternative to signal-cli)

### 2. Phone Number Registration
- **Primary phone number**: Must be registered with Signal
- **Verification code**: SMS/voice verification required
- **Device linking**: Link bot as secondary device (optional)

### 3. Signal Daemon Setup
```bash
# Option A: signal-cli-rest-api (Docker)
docker run -p 8080:8080 -v signal-cli-config:/home/.local/share/signal-cli bbernhard/signal-cli-rest-api

# Option B: signald (Native)
apt install signald
systemctl start signald
```

### 4. Environment Variables Needed
```env
SIGNAL_PHONE_NUMBER=+1234567890          # Bot's phone number
SIGNAL_API_URL=http://localhost:8080     # signal-cli-rest-api endpoint
SIGNAL_SOCKET_PATH=/signald/signald.sock # OR signald socket path
```

### 5. Registration Process

#### Option A: New Phone Number Registration
1. **Install signal-cli or start signal-cli-rest-api**
2. **Register phone number:**
   ```bash
   signal-cli -u +1234567890 register
   ```
3. **Verify with SMS code:**
   ```bash
   signal-cli -u +1234567890 verify 123456
   ```
4. **Test message sending:**
   ```bash
   signal-cli -u +1234567890 send -m "Test" +0987654321
   ```

#### Option B: Link to Existing Signal Mobile Device (Recommended)

##### Method B1: Using signal-cli-rest-api (Docker - Easiest)
**If you have Signal installed on your phone:**

1. **Start signal-cli-rest-api:**
   ```bash
   docker run -p 8080:8080 -v signal-cli-config:/home/.local/share/signal-cli bbernhard/signal-cli-rest-api
   ```

2. **Generate linking URI:**
   ```bash
   curl -X POST "http://localhost:8080/v1/register" \
     -H "Content-Type: application/json" \
     -d '{"use_voice": false}'
   ```
   
3. **Link device using QR code:**
   - Open Signal app on your phone
   - Go to Settings → Linked devices → Link New Device
   - Scan the QR code from the API response
   - OR use the linking URI directly

4. **Verify linking:**
   ```bash
   curl "http://localhost:8080/v1/about"
   ```

5. **Send test message:**
   ```bash
   curl -X POST "http://localhost:8080/v2/send" \
     -H "Content-Type: application/json" \
     -d '{
       "message": "Hello from bot!",
       "recipients": ["+1234567890"]
     }'
   ```

##### Method B2: Using signal-cli directly (Command Line)
**If you prefer native signal-cli:**

1. **Install signal-cli** (see installation instructions above)

2. **Link to your existing Signal account:**
   ```bash
   # Generate linking QR code
   signal-cli link -n "MyBot"
   ```
   This will display a QR code in your terminal.

3. **Scan QR code with Signal app:**
   - Open Signal app on your phone
   - Go to Settings → Linked devices → Link New Device
   - Scan the QR code displayed in terminal

4. **Verify linking worked:**
   ```bash
   # Check if linking was successful
   signal-cli -u YOUR_PHONE_NUMBER listIdentities
   ```

5. **Send test message:**
   ```bash
   signal-cli -u YOUR_PHONE_NUMBER send -m "Hello from signal-cli!" +1234567890
   ```

6. **Receive messages (daemon mode):**
   ```bash
   # Start daemon to receive messages
   signal-cli -u YOUR_PHONE_NUMBER daemon --system
   ```

**Benefits of Device Linking:**
- ✅ No need for separate phone number
- ✅ Use existing Signal identity
- ✅ Messages appear in your Signal app
- ✅ No SMS verification required
- ✅ Can receive messages on both devices

### 6. Local Development vs Production
- **Local**: signal-cli-rest-api Docker container
- **Production**: AWS Fargate with signal-cli-rest-api service
- **Both**: Same HTTP API endpoints for sending/receiving

### 7. Group Chat Requirements (Proposed Feature)
- **Group creation permissions**: Bot must be admin
- **Whitelist management**: Phone number validation
- **Group membership**: Add/remove participants

## Quick Local Setup

### Method 1: With Existing Signal Mobile Device (Easiest)

#### Using Docker (signal-cli-rest-api):
```bash
# 1. Start signal-cli-rest-api
docker-compose up signal-cli

# 2. Link to your phone (generates QR code)
curl -X POST localhost:8080/v1/register

# 3. Scan QR code with Signal app: Settings → Linked devices → Link New Device

# 4. Send test message
curl -X POST localhost:8080/v2/send \
  -H "Content-Type: application/json" \
  -d '{"message": "Hello from bot!", "recipients": ["+1234567890"]}'
```

#### Using Native signal-cli:
```bash
# 1. Install signal-cli (see installation section above)

# 2. Link to your phone
signal-cli link -n "MyBot"

# 3. Scan QR code with Signal app: Settings → Linked devices → Link New Device

# 4. Send test message
signal-cli -u YOUR_PHONE_NUMBER send -m "Hello from bot!" +1234567890

# 5. Optional: Start daemon to receive messages
signal-cli -u YOUR_PHONE_NUMBER daemon --system
```

### Method 2: New Phone Number Registration
```bash
# 1. Start signal-cli-rest-api
docker-compose up signal-cli

# 2. Register bot (one-time)
curl -X POST localhost:8080/v1/register/+1234567890

# 3. Verify with SMS code
curl -X POST localhost:8080/v1/register/+1234567890/verify/123456

# 4. Send test message
curl -X POST localhost:8080/v2/send \
  -H "Content-Type: application/json" \
  -d '{"message": "Hello!", "number": "+1234567890", "recipients": ["+0987654321"]}'
```

## Development Workflow with Real Device
1. **Link bot to your personal Signal account**
2. **Test locally:** Send messages to yourself/friends
3. **Debug:** All messages appear in your Signal app
4. **Deploy:** Same linking process works in production

**Status**: Mock implementation → Real Signal integration requires registration + daemon setup.