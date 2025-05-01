import { useState, useEffect, useRef } from "react";
import { useWebSocket } from "~/context/websocket-context";

const ParticipantChatBox = ({ roomId, userId }) => {
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState([]);
  const { sendMessage, addListener, removeListener } = useWebSocket();

  useEffect(() => {
    const handleMessage = (data) => {
      if (data?.type === "receiveMessage") {
        const { from, message } = data.payload;
        setMessages((prev) => {
          const updated = [...prev, { from, message }];
          return updated;
        });
      }
    };

    addListener(handleMessage);

    return () => {
      removeListener(handleMessage);
    };
  }, [userId]);

  const sendChatMessage = () => {
    if (!message.trim()) return;

    sendMessage({
      type: "participantMessage",
      payload: { roomId, fromuserId: userId, message },
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
    <div className="w-full max-w-md bg-white shadow-md rounded-xl p-4">
      <h5 className="text-lg font-semibold border-b pb-2 mb-3 text-gray-800">
        Chat with Admin
      </h5>

      <div
        className="h-60 overflow-y-auto border rounded-lg p-3 bg-gray-50 space-y-2"
        ref={chatBodyRef}
      >
        {messages.length === 0 ? (
          <div className="text-center text-sm text-gray-400">
            No messages yet.
          </div>
        ) : (
          messages.map((m, i) => {
            const isSender = m.from === userId;
            return (
              <div
                key={i}
                className={`flex ${isSender ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[75%] px-3 py-2 rounded-lg text-sm ${
                    isSender
                      ? "bg-indigo-600 text-white"
                      : "bg-gray-200 text-gray-800"
                  }`}
                >
                  <div className="text-xs text-gray-300 mb-1">
                    {isSender ? "Me" : "Admin"}
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
          className="flex-1 border text-black border-gray-300 rounded-l-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          placeholder="Type a message"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") sendChatMessage();
          }}
        />
        <button
          onClick={sendChatMessage}
          className="bg-indigo-600 text-white px-4 py-2 text-sm font-medium rounded-r-md hover:bg-indigo-700 transition"
        >
          Send
        </button>
      </div>
    </div>
  );
};

export default ParticipantChatBox;
