"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect } from "react";

// Redirect to main dashboard — content is now a tab there
export default function ContentRedirect() {
  const params = useParams();
  const router = useRouter();

  useEffect(() => {
    router.replace(`/i/${params.slug}/${params.code}`);
  }, [params.slug, params.code, router]);

  return (
    <div className="flex items-center justify-center h-screen bg-gray-950">
      <p className="text-gray-400 text-sm">Redirigiendo...</p>
    </div>
  );
}
