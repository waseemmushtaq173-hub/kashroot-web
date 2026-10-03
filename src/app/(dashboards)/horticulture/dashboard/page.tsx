export default function HorticultureDashboardPage() {
  return (
    <main className="kr-container py-10 theme-farmer">
      <div className="bg-kr-primary-600 text-white p-6 md:p-8 rounded-lg mb-8 shadow-md">
        <h1 className="font-heading text-display text-white">Horticulture Portal</h1>
        <p className="text-body-lg text-white/90 mt-2">
          Manage orchard produce, pruning tools, and cold-storage logistics.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* Orchard Fruits */}
        <section className="kr-card border-t-4 border-kr-primary-500">
          <h2 className="font-heading text-h3 text-kr-text-primary mb-4">Orchard Inventory</h2>
          <ul className="space-y-3">
            <li className="flex justify-between items-center p-3 bg-kr-bg-sunken rounded-md border border-kr-border-default">
              <span className="font-medium">Premium Apples (Box)</span>
              <span className="text-kr-text-secondary text-sm">4,500 Boxes</span>
            </li>
            <li className="flex justify-between items-center p-3 bg-kr-bg-sunken rounded-md border border-kr-border-default">
              <span className="font-medium">Walnuts (In-Shell)</span>
              <span className="text-kr-text-secondary text-sm">850 Kg</span>
            </li>
            <li className="flex justify-between items-center p-3 bg-kr-bg-sunken rounded-md border border-kr-border-default">
              <span className="font-medium">Saffron (Grade A)</span>
              <span className="text-kr-text-secondary text-sm">12 Kg</span>
            </li>
            <li className="flex justify-between items-center p-3 bg-kr-bg-sunken rounded-md border border-kr-border-default">
              <span className="font-medium">Cherries</span>
              <span className="text-kr-text-secondary text-sm">150 Boxes</span>
            </li>
          </ul>
        </section>

        {/* Specialized Tools */}
        <section className="kr-card border-t-4 border-kr-primary-500">
          <h2 className="font-heading text-h3 text-kr-text-primary mb-4">Specialized Tools & Infrastructure</h2>
          <ul className="space-y-3">
            <li className="flex justify-between items-center p-3 bg-kr-bg-sunken rounded-md border border-kr-border-default">
              <span className="font-medium">Pruning Shears</span>
              <span className="text-kr-text-secondary text-sm">340 Units</span>
            </li>
            <li className="flex justify-between items-center p-3 bg-kr-bg-sunken rounded-md border border-kr-border-default">
              <span className="font-medium">Anti-Hail Nets</span>
              <span className="text-kr-text-secondary text-sm">15,000 sq.m</span>
            </li>
            <li className="flex justify-between items-center p-3 bg-kr-bg-sunken rounded-md border border-kr-border-default">
              <span className="font-medium">Fruit Grading/Sorting Trays</span>
              <span className="text-kr-text-secondary text-sm">2,500 Units</span>
            </li>
            <li className="flex justify-between items-center p-3 bg-kr-bg-sunken rounded-md border border-kr-border-default">
              <span className="font-medium">Orchard Saplings</span>
              <span className="text-kr-text-secondary text-sm">800 Units</span>
            </li>
          </ul>
        </section>

        {/* Storage */}
        <section className="kr-card border-t-4 border-kr-primary-500">
          <h2 className="font-heading text-h3 text-kr-text-primary mb-4">Controlled-Atmosphere Logs</h2>
          <ul className="space-y-3">
            <li className="flex justify-between items-center p-3 bg-kr-bg-sunken rounded-md border border-kr-border-default">
              <span className="font-medium">CA Storage Unit A</span>
              <span className="text-kr-text-success text-sm font-medium">Optimal (2°C)</span>
            </li>
            <li className="flex justify-between items-center p-3 bg-kr-bg-sunken rounded-md border border-kr-border-default">
              <span className="font-medium">CA Storage Unit B</span>
              <span className="text-kr-text-warning text-sm font-medium">Defrosting</span>
            </li>
            <li className="flex justify-between items-center p-3 bg-kr-bg-sunken rounded-md border border-kr-border-default">
              <span className="font-medium">CA Storage Unit C</span>
              <span className="text-kr-text-success text-sm font-medium">Optimal (1°C)</span>
            </li>
          </ul>
        </section>
      </div>
    </main>
  );
}
