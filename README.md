# Room Monitor - React Web App

A real-time web application for monitoring participants in virtual rooms using **React**, **React Router**, **mediasoup**, **uWebSockets.js**, and **GStreamer**.

Admins can view all participants in a room and chat with them. Participants can also chat with the admin. Recordings of participant video streams are available and stored either locally or on a cloud provider, based on environment configuration.

---

## 📁 Features

- Multiple participants per room.
- Admin dashboard to view active rooms.
- Real-time chat between participants and admin.
- Video recording and storage.
- Adaptive storage (local or cloud via DigitalOcean Spaces/AWS S3).
- Fast WebSocket server using **uWebSockets.js**.
- Streaming handled by **mediasoup** and **GStreamer**.

---

## 📦 Project Structure

- `/dashboard` — View all active rooms.
- `/admin/<roomId>?userId=<userId>` — Admin view to monitor participants.
- `/participant/<roomId>?userId=<userId>` — Participant joins the room.
- Recordings are saved in the `recordings/` folder.

---

## 🚀 Getting Started

### 1. Clone the Repository

```bash
git clone https://github.com/rushibelkunde/room-monitor.git
cd room-monitor
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Environment Variables

Create a `.env` file in the root directory with the following variables:

```env
SPACE=local  # Use 'cloud' for cloud storage

# For cloud storage using DigitalOcean Spaces or AWS S3-compatible service
SPACES_ENDPOINT=your-spaces-endpoint
SPACES_ACCESS_KEY=your-access-key
SPACES_SECRET_KEY=your-secret-key
```

If you're storing recordings locally, set `SPACE=local`.

---

### 4. Install GStreamer and Uwebsocket

Make sure **GStreamer** is installed on your system.

#### On macOS (via Homebrew):

```bash
brew install gstreamer gst-plugins-base gst-plugins-good gst-libav
```

#### On Ubuntu/Debian:

```bash
sudo apt-get install -y gstreamer1.0-tools gstreamer1.0-plugins-{base,good,bad,ugly} gstreamer1.0-libav
```

```bash
npm install uNetworking/uWebSockets.js#v20.51.0
```
---

### 5. Start WebSocket Server

The signaling server is implemented in `uwebsocket` and must be running:


```bash
node websocket.js
```

---

### 6. Run the Development Server

```bash
npm run dev
```

---

## 📹 Recordings

Recordings are saved using **GStreamer**. The location depends on the environment:

- **Local Mode (`SPACE=local`)**: Recordings are saved in the `recordings/` directory.
- **Cloud Mode (`SPACE=cloud`)**: Recordings are uploaded to a DigitalOcean Space or an S3-compatible service using the provided environment variables.

Example storage code:

```js
const spacesEndpoint = new AWS.Endpoint(process.env.SPACES_ENDPOINT);
const s3 = new AWS.S3({
  endpoint: spacesEndpoint,
  accessKeyId: process.env.SPACES_ACCESS_KEY,
  secretAccessKey: process.env.SPACES_SECRET_KEY,
});
```

---

## 🧩 Tech Stack

- **Frontend**: React, React Router
- **Media Handling**: mediasoup, GStreamer
- **Networking**: uWebSockets.js, WebSocket
- **Storage**: Local filesystem, DigitalOcean Spaces or AWS S3
- **Signaling Server**: Custom `websocket.js` using uWebSockets.js

---

## 📬 Contributing

Pull requests are welcome. For major changes, please open an issue first to discuss what you'd like to change.

---

## 🛡️ License

MIT License

---

## 📞 Contact

For support or inquiries, contact [rushibelkunde18@gmail.com].