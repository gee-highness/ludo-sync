import { Button, Center, Heading, Text, VStack } from "@chakra-ui/react";
import Link from "next/link";

export const metadata = { title: "Not found · Ludo Sync" };

export default function NotFound() {
  return (
    <Center minH="100dvh" bg="#0b1020" color="white" p={6}>
      <VStack spacing={4} textAlign="center" maxW="360px">
        <Text fontSize="5xl" aria-hidden>🃏</Text>
        <Heading as="h1" size="lg">That page is not on the table</Heading>
        <Text color="gray.300">The link may be old. The games are one tap away.</Text>
        <Button as={Link} href="/" colorScheme="teal" w="100%">Back to the games</Button>
      </VStack>
    </Center>
  );
}
