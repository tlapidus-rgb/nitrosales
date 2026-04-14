// ══════════════════════════════════════════════════════════════
// /rentabilidad — Stock + Márgenes
// ══════════════════════════════════════════════════════════════
// Esta ruta reutiliza el componente ProductsPage de /products,
// que detecta el pathname via usePathname() y se auto-configura
// en "modo rentabilidad": título, subtítulo, tabs (Stock, Márgenes)
// y Hero adaptados. Cero duplicación de lógica ni de data-fetch.
// ══════════════════════════════════════════════════════════════

import ProductsPage from "../products/page";

export default function RentabilidadPage() {
  return <ProductsPage />;
}
