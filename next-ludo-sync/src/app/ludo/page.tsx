// src/app/ludo/page.tsx

"use client";

import LudoScene from "@/components/LudoScene";
import { useSearchParams } from 'next/navigation';
import { Box, Text, Center, Spinner } from "@chakra-ui/react";
import { Suspense } from "react";

function LudoPageContent() {
    const searchParams = useSearchParams();
    const gameMode = searchParams.get('gameMode') || 'bot'; // Default to 'bot' if not specified

    return <LudoScene gameMode={gameMode} />;
}


export default function LudoPage() {
    return (
        <main>
            <Suspense fallback={
                <Center w="100vw" h="100vh" bg="gray.800">
                    <Spinner size="xl" color="white" />
                </Center>
            }>
                <LudoPageContent />
            </Suspense>
        </main>
    );
}