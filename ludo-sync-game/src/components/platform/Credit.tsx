import { Link, Text } from "@chakra-ui/react";

/** The maker's credit, shown in the hub and at the bottom of every in-game menu. */
export function Credit() {
  return (
    <Text fontSize="xs" color="gray.400" textAlign="center" py={2}>
      Made with <span aria-label="love" role="img">🧡</span> by{" "}
      <Link href="https://godliness.vercel.app" isExternal color="yellow.200" textDecoration="underline" rel="noopener noreferrer">G</Link>{" "}
      <Link href="https://godliness.vercel.app" isExternal color="gray.400" rel="noopener noreferrer">(godliness.vercel.app)</Link>
    </Text>
  );
}
