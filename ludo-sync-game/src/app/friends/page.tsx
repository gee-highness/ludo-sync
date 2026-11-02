import { Suspense } from "react";
import FriendsClient from "@/components/friends/FriendsClient";

export const metadata = { title: "Friends · Ludo Sync" };

export default function FriendsPage() {
  return <Suspense fallback={null}><FriendsClient /></Suspense>;
}
