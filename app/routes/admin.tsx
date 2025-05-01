import React from "react";
import { Suspense, useEffect, useState } from "react";
import { useLoaderData, type LoaderFunction } from "react-router";
import AdminChatbox from "~/components/chatbox/admin-chatbox";
import { useWebSocket } from "~/context/websocket-context";

let device: any;
let consumerTransport: any;

export const loader: LoaderFunction = async ({ request, params }) => {
  const searchParams = new URL(request.url).searchParams;
  const roomId = params.roomId;
  const userId = searchParams.get("userId");
  return { roomId, userId };
};

const Admin = () => {
  const { roomId, userId: adminUserId } = useLoaderData();
  const [showSidebar, setShowSidebar] = useState(false);
  const { socket, sendMessage, addListener, removeListener } = useWebSocket();
  const [participants, setParticipants] = useState({});
  const [openChats, setOpenChats] = useState([]);
  const [userIds, setUserIds] = useState(new Set());

  useEffect(() => {
    if (!socket) return;

    sendMessage({
      type: "joinRoom",
      payload: { roomId, role: "admin", userId: adminUserId },
    });

    const handleConsume = async (items) => {
      if (!Array.isArray(items) || items.length === 0) {
        console.log("No producers to consume");
        return;
      }

      for (const item of items) {
        console.log("item", item);
        const consumer = await consumerTransport.consume({
          id: item.id,
          producerId: item.producerId,
          kind: item.kind,
          rtpParameters: item.rtpParameters,
        });

        const stream = new MediaStream([consumer.track]);

        setParticipants((prev) => ({
          ...prev,
          [item.userId]: {
            stream,
            status: "joined",
            userId: item.userId,
          },
        }));
        setUserIds((prev) => new Set(prev).add(item.userId));
      }
    };

    const handleMessage = async (data) => {
      const { type, payload } = data;

      if (type === "routerRtpCapabilities") {
        const mediasoupClient = await import("mediasoup-client");
        device = new mediasoupClient.Device();
        await device.load({ routerRtpCapabilities: payload });

        sendMessage({
          type: "createWebRtcTransport",
          payload: { roomId },
        });
      }

      if (type === "createWebRtcTransport") {
        consumerTransport = device.createRecvTransport(payload);

        consumerTransport.on("connect", ({ dtlsParameters }, callback) => {
          sendMessage({
            type: "connectTransport",
            payload: {
              dtlsParameters,
              transportId: consumerTransport.id,
              roomId,
            },
          });
          callback();
        });

        sendMessage({
          type: "consume",
          payload: { rtpCapabilities: device.rtpCapabilities, roomId },
        });
      }

      if (type === "newProducer") {
        sendMessage({
          type: "consume",
          payload: { rtpCapabilities: device.rtpCapabilities, roomId },
        });
      }

      if (type === "consume") {
        handleConsume(payload);
      }

      if (type === "participantLeft") {
        const { userId } = payload;
        setParticipants((prev) => {
          const participant = prev[userId];
          if (participant?.stream) {
            participant.stream.getTracks().forEach((track) => track.stop());
          }
          return {
            ...prev,
            [userId]: {
              ...participant,
              status: "left",
            },
          };
        });
      }
    };

    addListener(handleMessage);

    return () => {
      removeListener(handleMessage);
      setParticipants({});
    };
  }, [socket, roomId]);

  const handleOpenChat = (user) => {
    if (!openChats.find((chat) => chat.userId === user.userId)) {
      setOpenChats((prev) => [...prev, user]);
    }
    setShowSidebar(true);
  };

  const handleCloseSidebar = () => {
    setOpenChats([]); // Close all chats
    setShowSidebar(false); // Hide sidebar
  };

  console.log("userIds", userIds);

  return (
    <section className="p-4 bg-gray-50 min-h-screen">
      <div className="max-w-7xl mx-auto">
        <Suspense
          fallback={<div className="text-center text-gray-500">Loading...</div>}
        >
          <div>
            <h2 className="text-2xl font-bold text-gray-800 mb-6">
              Live Participants of{" "}
              <span className="text-indigo-600">{roomId}</span>
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {Object.entries(participants).map(
                ([user, { stream, status, userId }]) => (
                  <div
                    key={userId}
                    className="bg-white rounded-2xl shadow-md overflow-hidden flex flex-col"
                  >
                    <div className="aspect-video bg-black">
                      <VideoPlayer stream={stream} />
                    </div>

                    <div className="p-4 flex flex-col justify-between flex-grow">
                      <p
                        className={`text-sm font-medium ${
                          status === "joined"
                            ? "text-green-600"
                            : "text-red-600"
                        }`}
                      >
                        {status === "joined" ? "🟢 Live" : "🔴 Left"}
                      </p>
                      <h5 className="text-lg font-semibold text-gray-900 mt-1 mb-3">
                        {userId}
                      </h5>

                      <button
                        className="mt-auto inline-flex justify-center items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition"
                        onClick={() =>
                          handleOpenChat({ stream, status, userId })
                        }
                      >
                        💬 Chat
                      </button>
                    </div>
                  </div>
                )
              )}
            </div>
          </div>
        </Suspense>
      </div>

      {/* Sidebar */}
      <div
        className={`fixed top-0 right-0 h-full w-full max-w-md bg-white shadow-xl z-50 transition-transform duration-300 transform ${
          showSidebar ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="flex justify-between items-center p-4 border-b">
          <h2 className="text-xl font-semibold text-indigo-600">Chats</h2>
          <button
            onClick={handleCloseSidebar}
            className="text-gray-500 hover:text-gray-800 text-xl"
          >
            ✕
          </button>
        </div>

        <div className="p-4">
          {openChats.length === 0 && (
            <p className="text-center text-gray-400">No Chats Open</p>
          )}

          {Object.entries(participants).map(
            ([user, { stream, status, userId }]) =>
              openChats.some((oc) => oc.userId === userId) ? (
                <div key={userId} className="mb-4">
                  <AdminChatbox
                    adminUserId={adminUserId}
                    roomId={roomId}
                    user={{ stream, status, userId }}
                    onClose={() =>
                      setOpenChats((prev) =>
                        prev.filter((c) => c.userId !== userId)
                      )
                    }
                  />
                </div>
              ) : null
          )}
        </div>
      </div>
    </section>
  );
};

const VideoPlayer = ({ stream }) => {
  const ref = React.useRef(null);

  useEffect(() => {
    if (ref.current && stream) {
      ref.current.srcObject = stream;
    }
  }, [stream]);

  return (
    <video
      key={stream?.id}
      ref={ref}
      autoPlay
      muted
      playsInline
      className="aspect-video"
    />
  );
};

export default Admin;
