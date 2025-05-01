import React, { useEffect, useRef, useState } from "react";

import { useLoaderData, type LoaderFunction } from "react-router";
import ParticipantChatBox from "~/components/chatbox/participant-chatbox";
import { useWebSocket } from "~/context/websocket-context";

let device: any;
let producerTransport: any;
let producer: any;

export const loader: LoaderFunction = async ({ request, params }) => {
  const searchParams = new URL(request.url).searchParams;
  const roomId = params.roomId;
  const userId = searchParams.get("userId");

  return {
    roomId,
    userId,
  };
};

const Participant = () => {
  const { userId, roomId } = useLoaderData();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [showChat, setShowChat] = useState(false);

  const {
    socket,
    sendMessage,
    addListener,
    removeListener,
    sendMessageWithAck,
  } = useWebSocket();

  useEffect(() => {
    if (!socket) return;

    const init = async () => {
      const localStream = await navigator.mediaDevices.getUserMedia({
        video: true,
      });
      setStream(localStream);
      videoRef.current!.srcObject = localStream;

      localStream.getVideoTracks()[0].onended = () => {
        alert("Camera turned off! Please keep it on.");
      };

      sendMessage({
        type: "joinRoom",
        payload: { roomId, userId, role: "participant" },
      });

      const handleMessage = async ({ type, payload }: any) => {
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
          const params = payload;

          producerTransport = device.createSendTransport(params);

          producerTransport.on("connect", ({ dtlsParameters }, callback) => {
            sendMessage({
              type: "connectTransport",
              payload: {
                dtlsParameters,
                transportId: producerTransport.id,
                roomId,
              },
            });
            callback();
          });

          producerTransport.on(
            "produce",
            async ({ kind, rtpParameters }, callback) => {
              try {
                const ackId = Date.now() + Math.random();
                const response: any = await sendMessageWithAck(socket, {
                  type: "produce",
                  payload: {
                    kind,
                    rtpParameters,
                    transportId: producerTransport.id,
                    roomId,
                    ackId,
                  },
                });

                callback({ id: response.id });
              } catch (error) {
                console.error("Produce Error:", error);
              }
            }
          );

          const track = localStream.getVideoTracks()[0];
          producer = await producerTransport.produce({ track });

          track.applyConstraints({
            width: { ideal: 1280 },
            height: { ideal: 720 },
            frameRate: { ideal: 30 },
          });
        }
      };

      addListener(handleMessage);

      return () => {
        removeListener(handleMessage);
      };
    };

    init();

    return () => {
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }
      console.log("socketBeforeUnmounting", socket);
    };
  }, [socket]);

  return (
    <div className="flex flex-col items-center gap-3 w-fit">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        width={200}
        height={200}
        className="rounded-lg border border-gray-300"
      />

      <button
        onClick={() => setShowChat(!showChat)}
        className="w-20 py-2 px-3 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-md transition"
      >
        {showChat ? "Hide" : "Chat"}
      </button>

      <div className={`mt-2 w-full ${!showChat ? "hidden" : ""}`}>
        <ParticipantChatBox userId={userId} roomId={roomId} />
      </div>
    </div>
  );
};

export default Participant;
