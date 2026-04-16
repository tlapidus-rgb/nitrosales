/** @type {import("next").NextConfig} */
const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  async redirects() {
    return [
      // Legacy → Bondly module
      { source: "/customers", destination: "/bondly/clientes", permanent: true },
      { source: "/customers/ltv", destination: "/bondly/ltv", permanent: true },
      { source: "/audiences", destination: "/bondly/audiencias", permanent: true },
    ];
  },
};

module.exports = nextConfig;
