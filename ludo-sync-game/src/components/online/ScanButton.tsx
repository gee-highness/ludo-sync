"use client";

import { Box, Button, Text } from "@chakra-ui/react";
import { useEffect, useRef, useState } from "react";
import { extractRoomCode } from "@/lib/net/identity";

/** Opens the camera and reads a room QR code. Hidden where there is no camera. */
export const ScanButton = ({ onCode, parse = extractRoomCode, label = "Scan a QR code", failText = "Camera not available. Type the code instead." }: {
  onCode: (code: string) => void;
  /** Turns what the camera read into what the screen wants, or null to keep looking. */
  parse?: (text: string) => string | null;
  label?: string;
  failText?: string;
}) => {
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState("");
  const video = useRef<HTMLVideoElement>(null);
  const [supported, setSupported] = useState(false);

  useEffect(() => { setSupported(!!navigator.mediaDevices?.getUserMedia); }, []);

  useEffect(() => {
    if (!scanning) return;
    let stop: (() => void) | undefined;
    let cancelled = false;
    (async () => {
      try {
        const { BrowserQRCodeReader } = await import("@zxing/library");
        const reader = new BrowserQRCodeReader();
        stop = () => reader.reset();
        await reader.decodeFromVideoDevice(null, video.current!, result => {
          const code = result ? parse(result.getText()) : null;
          if (code && !cancelled) { cancelled = true; reader.reset(); setScanning(false); onCode(code); }
        });
      } catch {
        if (!cancelled) { setError(failText); setScanning(false); }
      }
    })();
    return () => { cancelled = true; stop?.(); };
  }, [scanning, onCode, parse, failText]);

  if (!supported) return null;
  return (
    <Box w="100%">
      {scanning && (
        <Box mb={2} borderRadius="lg" overflow="hidden" bg="black">
          <video ref={video} muted playsInline style={{ width: "100%", maxHeight: 260, objectFit: "cover" }} aria-label="Camera preview" />
        </Box>
      )}
      <Button variant="outline" color="white" w="100%" onClick={() => { setError(""); setScanning(s => !s); }}>
        {scanning ? "Stop scanning" : label}
      </Button>
      {error && <Text color="red.300" fontSize="sm" mt={1}>{error}</Text>}
    </Box>
  );
};
