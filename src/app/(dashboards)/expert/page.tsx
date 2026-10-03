'use client';

import { useEffect, useState } from 'react';
import { BookOpen, ShieldAlert, CheckCircle2, MessageCircle, FileText, FlaskConical, Stethoscope, Edit3, Lock } from 'lucide-react';

export default function ExpertDashboard() {
  const [isExpert, setIsExpert] = useState(false);
  const [isVerified, setIsVerified] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const role = localStorage.getItem('user_role');
      setIsExpert(role === 'EXPERT');
      
      const appStr = localStorage.getItem('expert_application');
      if (appStr) {
        const app = JSON.parse(appStr);
        setIsVerified(app.status === 'VERIFIED_EXPERT');
      } else {
        // Mock default verified state for non-new registrations
        setIsVerified(true);
      }
    }
  }, []);

  return (
    <div className="kr-container py-8 space-y-8">
      <header className="mb-8">
        <h1 className="font-heading text-h1 text-kr-text-primary">Advisory & Knowledge Hub</h1>
        <p className="text-body mt-2 text-kr-text-secondary">
          Region-specific agricultural guidance, disease management, and direct agronomy support.
        </p>
      </header>

      {isExpert && !isVerified && (
        <div className="bg-kr-warning-50 border-l-4 border-kr-warning-500 p-4 mb-6 rounded-r-md flex gap-4">
          <ShieldAlert className="w-6 h-6 text-kr-warning-600 flex-shrink-0" />
          <div>
            <h3 className="font-semibold text-kr-warning-800">Account Under Credential Verification</h3>
            <p className="text-kr-warning-700 text-sm mt-1">
              You will be able to publish advisories and answer farmer queries once your qualifications are approved by the Platform Admin.
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Knowledge Base Section */}
        <div className="lg:col-span-2 space-y-6">
          <section className="kr-card p-6 border-l-4 border-l-kr-warning-500">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <ShieldAlert className="w-6 h-6 text-kr-warning-600" />
                <h2 className="text-h3 font-heading">Disease Management Protocols</h2>
              </div>
              {isExpert && (
                <button 
                  disabled={!isVerified} 
                  className={`kr-btn-ghost kr-btn-sm flex items-center gap-2 ${!isVerified ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  {!isVerified ? <Lock className="w-4 h-4" /> : <Edit3 className="w-4 h-4" />}
                  Publish Protocol
                </button>
              )}
            </div>
            
            <div className="space-y-4">
              <div className="border border-kr-border-default rounded-md p-4">
                <h3 className="font-semibold text-kr-text-primary text-body-lg">Apple Scab (Venturia inaequalis)</h3>
                <p className="text-caption text-kr-text-secondary mt-1">Status: High Alert (Pre-bloom to Petal fall phase)</p>
                <div className="mt-3 bg-kr-bg-sunken p-3 text-body-sm text-kr-text-secondary rounded">
                  <strong>Treatment Schedule:</strong>
                  <ul className="list-disc pl-4 mt-1 space-y-1">
                    <li>Silver tip to Green tip: Dodine 65 WP (60g/100L) or Captan 50 WP (300g/100L).</li>
                    <li>Pink bud stage: Mancozeb 75 WP (300g/100L) or Propineb 70 WP (300g/100L).</li>
                    <li>Ensure proper canopy pruning for aeration to lower humidity.</li>
                  </ul>
                </div>
              </div>

              <div className="border border-kr-border-default rounded-md p-4">
                <h3 className="font-semibold text-kr-text-primary text-body-lg">San Jose Scale</h3>
                <div className="mt-3 bg-kr-bg-sunken p-3 text-body-sm text-kr-text-secondary rounded">
                  <strong>Intervention:</strong> Apply Horticulture Mineral Oil (HMO) at 2% concentration during the delayed dormant stage (late Feb/early March). Avoid spraying during freezing temperatures.
                </div>
              </div>

              <div className="border border-kr-border-default rounded-md p-4">
                <h3 className="font-semibold text-kr-text-primary text-body-lg">Walnut Blight (Xanthomonas arboricola)</h3>
                <div className="mt-3 bg-kr-bg-sunken p-3 text-body-sm text-kr-text-secondary rounded">
                  <strong>Prevention:</strong> Copper-based sprays (e.g., Copper Oxychloride 50 WP at 300g/100L) during early leaf emergence and pre-bloom. Repeat post-bloom if spring rains are heavy.
                </div>
              </div>
            </div>
          </section>

          <section className="kr-card p-6 border-l-4 border-l-kr-success-500">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-6 h-6 text-kr-success-600" />
                <h2 className="text-h3 font-heading">Best Practices & SOPs</h2>
              </div>
              {isExpert && (
                <button 
                  disabled={!isVerified} 
                  className={`kr-btn-ghost kr-btn-sm flex items-center gap-2 ${!isVerified ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  {!isVerified ? <Lock className="w-4 h-4" /> : <Edit3 className="w-4 h-4" />}
                  Publish SOP
                </button>
              )}
            </div>
            
            <div className="space-y-4">
              <div className="border border-kr-border-default rounded-md p-4 flex gap-4">
                <div className="mt-1"><BookOpen className="w-5 h-5 text-kr-primary-600" /></div>
                <div>
                  <h3 className="font-medium text-kr-text-primary">High-Density Apple Orchard Planting</h3>
                  <p className="text-body-sm text-kr-text-secondary mt-1">Recommended rootstocks (M9, MM106). Pit size 3x3x3 ft. Space rows 3m apart and trees 1m apart. Install drip irrigation and trellis systems prior to planting.</p>
                </div>
              </div>

              <div className="border border-kr-border-default rounded-md p-4 flex gap-4">
                <div className="mt-1"><BookOpen className="w-5 h-5 text-kr-primary-600" /></div>
                <div>
                  <h3 className="font-medium text-kr-text-primary">Saffron Corm Grading & Soil Prep</h3>
                  <p className="text-body-sm text-kr-text-secondary mt-1">Select corms weighing {'>'} 8g. Treat with Carbendazim 50 WP (2g/L) for 30 minutes before planting. Soil pH should ideally be 6.5 to 7.5 (Pampore karewas).</p>
                </div>
              </div>

              <div className="border border-kr-border-default rounded-md p-4 flex gap-4">
                <div className="mt-1"><BookOpen className="w-5 h-5 text-kr-primary-600" /></div>
                <div>
                  <h3 className="font-medium text-kr-text-primary">Optimal NPK Application Rates</h3>
                  <p className="text-body-sm text-kr-text-secondary mt-1">Always perform soil testing first. Baseline for bearing apple trees (10+ years): 700g N, 350g P2O5, 700g K2O per tree applied in split doses.</p>
                </div>
              </div>
            </div>
          </section>
        </div>

        {/* Action Panel */}
        <div className="space-y-6">
          <section className="kr-card p-6 bg-kr-bg-sunken">
            <div className="flex items-center gap-2 mb-4">
              <Stethoscope className="w-6 h-6 text-kr-primary-600" />
              <h2 className="text-h3 font-heading">{isExpert ? 'Expert Actions' : 'Expert Connect'}</h2>
            </div>
            {isExpert ? (
              <>
                <p className="text-body-sm text-kr-text-secondary mb-4">
                  Manage your consultations and farmer queries.
                </p>
                <button disabled={!isVerified} className={`kr-btn-primary w-full flex items-center justify-center gap-2 ${!isVerified ? 'opacity-50 cursor-not-allowed' : ''}`}>
                  {!isVerified ? <Lock className="w-4 h-4" /> : <MessageCircle className="w-4 h-4" />}
                  Answer Farmer Queries
                </button>
                <button disabled={!isVerified} className={`kr-btn-secondary w-full mt-3 flex items-center justify-center gap-2 ${!isVerified ? 'opacity-50 cursor-not-allowed' : ''}`}>
                  {!isVerified ? <Lock className="w-4 h-4" /> : <Edit3 className="w-4 h-4" />}
                  Draft New Advisory
                </button>
              </>
            ) : (
              <>
                <p className="text-body-sm text-kr-text-secondary mb-4">
                  Consult with verified SKUAST agronomists and regional horticulture experts.
                </p>
                <button className="kr-btn-primary w-full flex items-center justify-center gap-2">
                  <MessageCircle className="w-4 h-4" />
                  Ask an Agronomist
                </button>
                <button className="kr-btn-secondary w-full mt-3 flex items-center justify-center gap-2">
                  <FileText className="w-4 h-4" />
                  Upload Crop Image
                </button>
              </>
            )}
          </section>

          <section className="kr-card p-6">
            <div className="flex items-center gap-2 mb-4">
              <FlaskConical className="w-6 h-6 text-kr-primary-600" />
              <h2 className="text-h3 font-heading">Soil Health</h2>
            </div>
            <p className="text-body-sm text-kr-text-secondary mb-4">
              Order a comprehensive NPK and micronutrient testing kit to your orchard.
            </p>
            <button className="kr-btn-primary w-full text-center">
              Request Soil Test Kit
            </button>
          </section>
        </div>
        
      </div>
    </div>
  );
}
