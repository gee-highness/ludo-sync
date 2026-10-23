import type { Metadata } from "next";
import PieceMaker from "@/components/pieces/PieceMaker";

export const metadata: Metadata = { title: "Piece maker · Ludo Sync" };

export default function Page() {
  return <PieceMaker />;
}
