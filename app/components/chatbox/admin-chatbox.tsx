import { useEffect, useRef, useState } from "react";
import { useWebSocket } from "~/context/websocket-context";


const AdminChatbox = ({ roomId, user, onClose, adminUserId }) => {
  const { sendMessage, addListener, removeListener } = useWebSocket();
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState([]);

  console.log("user", user);

  useEffect(() => {
    const handleMessage = (data) => {
      if (data?.type === "receiveMessage") {
        const { from, message } = data.payload;
        if (from === user.userId || from === adminUserId) {
          setMessages((prev) => {
            const updated = [...prev, { from, message }];
            return updated;
          });
        }
      }
    };

    addListener(handleMessage);

    return () => {
      removeListener(handleMessage);
    };
  }, [user.userId]);

  const sendChatMessage = () => {
    if (!message.trim()) return;

    sendMessage({
      type: "adminMessage",
      payload: {
        roomId,
        fromuserId: adminUserId,
        touserId: user.userId,
        message,
      },
    });

    setMessages((prev) => {
      return [...prev, { from: adminUserId, message }];
    });

    setMessage("");
  };

  const chatBodyRef = useRef(null); // Ref to chat body container

  const scrollToBottom = () => {
    if (chatBodyRef.current) {
      chatBodyRef.current.scrollTop = chatBodyRef.current.scrollHeight;
    }
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]); // Whenever new message added → auto scroll

  return (
    <div className="w-80 bg-white rounded-xl shadow-lg p-4">
      <div className="flex items-center justify-between border-b pb-2 mb-3">
        <h6 className="text-lg font-semibold text-gray-800">
          Chat with {user.userId}
        </h6>
        <button
          onClick={onClose}
          className="text-xl font-bold text-gray-600 hover:text-red-500"
        >
          &minus;
        </button>
      </div>

      <div
        className="h-60 overflow-y-auto border rounded-lg p-3 bg-gray-50 space-y-2"
        ref={chatBodyRef}
      >
        {messages.length === 0 ? (
          <div className="text-gray-400 text-center text-sm">
            No messages yet.
          </div>
        ) : (
          messages.map((m, i) => {
            const isSender = m.from === adminUserId;
            return (
              <div
                key={i}
                className={`flex ${isSender ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[75%] rounded-lg px-3 py-2 text-sm ${
                    isSender
                      ? "bg-indigo-600 text-white"
                      : "bg-gray-200 text-gray-800"
                  }`}
                >
                  <div className="text-xs text-gray-300 mb-1">
                    {isSender ? "Me" : user.userId}
                  </div>
                  {m.message}
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className="flex mt-3">
        <input
          type="text"
          placeholder="Type a message"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              sendChatMessage();
            }
          }}
          className="flex-1 text-black rounded-l-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
        <button
          onClick={sendChatMessage}
          className="bg-indigo-600 text-white px-4 py-2 rounded-r-md text-sm font-medium hover:bg-indigo-700 transition"
        >
          Send
        </button>
      </div>
    </div>
  );
};

export default AdminChatbox;
