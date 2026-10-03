export default function AgricultureDashboardPage() {
  return (
    <main className="kr-container py-10 theme-farmer">
      <div className="bg-kr-primary-600 text-white p-6 md:p-8 rounded-lg mb-8 shadow-md">
        <h1 className="font-heading text-display text-white">Agriculture Portal</h1>
        <p className="text-body-lg text-white/90 mt-2">
          Manage field crops, essential fertilizers, and heavy farm machinery.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* Seeds */}
        <section className="kr-card border-t-4 border-kr-primary-500">
          <h2 className="font-heading text-h3 text-kr-text-primary mb-4">Seeds Inventory</h2>
          <ul className="space-y-3">
            <li className="flex justify-between items-center p-3 bg-kr-bg-sunken rounded-md border border-kr-border-default">
              <span className="font-medium">High-Yield Wheat</span>
              <span className="text-kr-text-secondary text-sm">450 Quintals</span>
            </li>
            <li className="flex justify-between items-center p-3 bg-kr-bg-sunken rounded-md border border-kr-border-default">
              <span className="font-medium">Paddy (Basmati)</span>
              <span className="text-kr-text-secondary text-sm">300 Quintals</span>
            </li>
            <li className="flex justify-between items-center p-3 bg-kr-bg-sunken rounded-md border border-kr-border-default">
              <span className="font-medium">Maize Hybrid</span>
              <span className="text-kr-text-secondary text-sm">120 Quintals</span>
            </li>
          </ul>
        </section>

        {/* Fertilizers & Chemicals */}
        <section className="kr-card border-t-4 border-kr-primary-500">
          <h2 className="font-heading text-h3 text-kr-text-primary mb-4">Agrochemicals</h2>
          <ul className="space-y-3">
            <li className="flex justify-between items-center p-3 bg-kr-bg-sunken rounded-md border border-kr-border-default">
              <span className="font-medium">Urea (46% N)</span>
              <span className="text-kr-text-secondary text-sm">1,200 Bags</span>
            </li>
            <li className="flex justify-between items-center p-3 bg-kr-bg-sunken rounded-md border border-kr-border-default">
              <span className="font-medium">DAP (18-46-0)</span>
              <span className="text-kr-text-secondary text-sm">850 Bags</span>
            </li>
            <li className="flex justify-between items-center p-3 bg-kr-bg-sunken rounded-md border border-kr-border-default">
              <span className="font-medium">NPK 19:19:19</span>
              <span className="text-kr-text-secondary text-sm">500 Bags</span>
            </li>
            <li className="flex justify-between items-center p-3 bg-kr-bg-sunken rounded-md border border-kr-border-default">
              <span className="font-medium">Crop Protection Pesticides</span>
              <span className="text-kr-text-secondary text-sm">In Stock</span>
            </li>
          </ul>
        </section>

        {/* Heavy Machinery */}
        <section className="kr-card border-t-4 border-kr-primary-500">
          <h2 className="font-heading text-h3 text-kr-text-primary mb-4">Heavy Machinery & Tools</h2>
          <ul className="space-y-3">
            <li className="flex justify-between items-center p-3 bg-kr-bg-sunken rounded-md border border-kr-border-default">
              <span className="font-medium">Tractors (45 HP)</span>
              <span className="text-kr-text-secondary text-sm">12 Units</span>
            </li>
            <li className="flex justify-between items-center p-3 bg-kr-bg-sunken rounded-md border border-kr-border-default">
              <span className="font-medium">Cultivators</span>
              <span className="text-kr-text-secondary text-sm">24 Units</span>
            </li>
            <li className="flex justify-between items-center p-3 bg-kr-bg-sunken rounded-md border border-kr-border-default">
              <span className="font-medium">Boom Sprayers</span>
              <span className="text-kr-text-secondary text-sm">8 Units</span>
            </li>
          </ul>
        </section>
      </div>
    </main>
  );
}
