import { useEffect, useState } from "react";
import { Link } from "react-router";
import { useWebSocket } from "~/context/websocket-context";

const Dashboard = () => {
  const [rooms, setRooms] = useState([]);
  const { socket, sendMessage, addListener, removeListener } = useWebSocket();

  useEffect(() => {
    const handleMessage = (data: any) => {
      console.log(data);
      if (data?.type === "activeRoomsUpdate") {
        setRooms(data.payload || []);
      }
    };

    addListener(handleMessage);

    if (socket?.readyState === 1) {
      // Socket is already open
      sendMessage({
        type: "requestActiveRooms",
        payload: {},
      });
    } else {
      // Wait until WebSocket is open
      socket?.addEventListener("open", () => {
        sendMessage({
          type: "requestActiveRooms",
          payload: {},
        });
      });
    }

    return () => {
      removeListener(handleMessage);
    };
  }, [socket]);

  return (
    <section className="p-6 bg-gray-50 min-h-screen">
      <div className="max-w-6xl mx-auto">
        <div className="mb-8">
          <h3 className="text-2xl font-semibold text-gray-800">
            Active Rooms{" "}
            <span className="text-indigo-600">({rooms.length})</span>
          </h3>

          <div className="mt-6 flex flex-wrap gap-6">
            {rooms?.map((room) => (
              <div
                key={room.roomId}
                className="flex flex-col items-center bg-white p-4 rounded-xl shadow-md w-[120px]"
              >
                <a href={`/admin/${room.roomId}`} className="w-full">
                  <button className="w-full h-[100px] bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg text-lg transition duration-200">
                    {room.roomId}
                  </button>
                </a>

                <a
                  href={`/admin/${room.roomId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 text-sm font-medium text-indigo-500 hover:text-indigo-700 transition"
                >
                  Open in new tab
                </a>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};

export default Dashboard;
