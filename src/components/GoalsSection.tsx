import React, { useState } from 'react';
import { ChevronRight, X, Target, TrendingUp, Clock, Sparkles } from 'lucide-react';
import { toast } from 'sonner';

interface GoalsSectionProps {
  className?: string;
}

export const GoalsSection: React.FC<GoalsSectionProps> = ({ className = '' }) => {
  const [showPreviewModal, setShowPreviewModal] = useState(false);

  const handleCardClick = () => {
    // Future feature: does not redirect to any other page
    setShowPreviewModal(true);
  };

  return (
    <section aria-label="Goals" className={`w-full mb-5 ${className}`}>
      {/* Section Header (No "Preview" badge inline with Goals) */}
      <div className="flex items-center justify-between mb-2.5 px-0.5">
        <h2 className="text-[17px] font-bold text-[#202522] tracking-[-0.015em]">
          Goals
        </h2>

        <button
          type="button"
          onClick={handleCardClick}
          className="text-[13px] font-semibold text-[#68716C] hover:text-[#202522] transition-colors cursor-pointer flex items-center gap-0.5"
        >
          Details
          <ChevronRight size={14} className="mt-0.5" />
        </button>
      </div>

      {/* Box-Type Side-by-Side Containers */}
      <div className="grid grid-cols-2 gap-2.5 sm:gap-3">
        {/* Container 1: The Blue Box (Whiter shade of blue, no overview icon or text) */}
        <div
          role="button"
          tabIndex={0}
          onClick={handleCardClick}
          onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && handleCardClick()}
          className="rounded-2xl p-4 cursor-pointer relative overflow-hidden transition-all duration-200 active:scale-[0.98] bg-gradient-to-br from-[#F0F7FE] to-[#E2F0FD] border border-[#CCE3F8] shadow-xs flex flex-col justify-between min-h-[155px] select-none group"
        >
          {/* Middle: Title & Context Explaining Goals */}
          <div className="my-auto py-0.5">
            <h3 className="text-[14px] sm:text-[15px] font-bold text-[#0C4A6E] mb-1.5 leading-tight">
              What are Goals?
            </h3>
            <p className="text-[11.5px] sm:text-[12px] leading-relaxed text-[#334155]">
              Set business milestones, track your progress, and stay focused on growing your store.
            </p>
          </div>

          {/* Bottom Action Hint */}
          <div className="pt-2 border-t border-[#BAE0FD]/70 flex items-center justify-between text-[11.5px] font-semibold text-[#0284C7] group-hover:text-[#0369A1] transition-colors">
            <span>Learn more</span>
            <ChevronRight size={14} />
          </div>
        </div>

        {/* Container 2: The Broken Line Box (No sparkle icon, no 'Future', no 'Soon') */}
        <div
          role="button"
          tabIndex={0}
          onClick={handleCardClick}
          onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && handleCardClick()}
          className="rounded-2xl p-4 cursor-pointer relative transition-all duration-200 active:scale-[0.98] border-2 border-dashed border-[#CBD5E1] hover:border-[#94A3B8] bg-[#F8FAFC] hover:bg-[#F1F5F9] flex flex-col justify-between min-h-[155px] select-none group"
        >
          {/* Middle: Context Explaining Future Updates */}
          <div className="my-auto py-0.5">
            <h3 className="text-[14px] sm:text-[15px] font-bold text-[#1E293B] mb-1.5 leading-tight group-hover:text-[#0284C7] transition-colors">
              For Future Updates
            </h3>
            <p className="text-[11.5px] sm:text-[12px] leading-relaxed text-[#64748B]">
              This feature will be available in upcoming updates. Stay tuned for new milestone tools!
            </p>
          </div>

          {/* Bottom Action Hint (No 'Soon') */}
          <div className="pt-2 border-t border-slate-200 flex items-center justify-between text-[11.5px] font-medium text-[#64748B]">
            <span className="flex items-center gap-1.5 text-slate-500">
              <Clock size={13} />
              In progress
            </span>
            <ChevronRight size={14} className="text-slate-400 group-hover:text-[#64748B] transition-colors" />
          </div>
        </div>
      </div>

      {/* Future Feature Preview Modal (Does not redirect anywhere) */}
      {showPreviewModal && (
        <div
          className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-200"
          onClick={() => setShowPreviewModal(false)}
        >
          <div
            className="w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-3xl p-5 sm:p-6 shadow-2xl relative animate-in slide-in-from-bottom duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close Button */}
            <button
              type="button"
              onClick={() => setShowPreviewModal(false)}
              className="absolute top-4 right-4 w-8 h-8 rounded-full bg-zinc-100 hover:bg-zinc-200 flex items-center justify-center text-zinc-600 transition-colors cursor-pointer"
              aria-label="Close"
            >
              <X size={18} />
            </button>

            {/* Modal Content */}
            <div className="text-center pt-2 pb-2">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#E0F2FE] to-[#BAE6FD] text-[#0369A1] flex items-center justify-center mx-auto mb-3.5 shadow-sm border border-[#BAE6FD]">
                <Target size={28} strokeWidth={2.2} />
              </div>

              <h3 className="text-[19px] font-bold text-zinc-900 mb-1.5">
                About Goals
              </h3>
              <p className="text-[13px] text-zinc-600 max-w-xs mx-auto leading-relaxed mb-5">
                Goals is an upcoming feature designed to help you define store milestones, track inventory movement targets, and celebrate your business growth.
              </p>

              {/* Explanatory cards */}
              <div className="space-y-2.5 text-left mb-6">
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-sky-100 text-sky-700 flex items-center justify-center shrink-0 mt-0.5">
                    <Target size={16} />
                  </div>
                  <div>
                    <h4 className="text-[13px] font-bold text-zinc-900">What are Goals?</h4>
                    <p className="text-[12px] text-zinc-500">A dedicated workspace to plan store targets and keep your team aligned.</p>
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-sky-100 text-sky-700 flex items-center justify-center shrink-0 mt-0.5">
                    <TrendingUp size={16} />
                  </div>
                  <div>
                    <h4 className="text-[13px] font-bold text-zinc-900">Track Progress</h4>
                    <p className="text-[12px] text-zinc-500">Monitor how your transactions and inventory movement push you closer to targets.</p>
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-sky-100 text-sky-700 flex items-center justify-center shrink-0 mt-0.5">
                    <Clock size={16} />
                  </div>
                  <div>
                    <h4 className="text-[13px] font-bold text-zinc-900">Coming in Future Updates</h4>
                    <p className="text-[12px] text-zinc-500">This feature is currently in design and will arrive in a future app update.</p>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowPreviewModal(false);
                    toast.success('Thanks for your feedback! Goals will arrive in an upcoming update.');
                  }}
                  className="w-full py-3 px-4 rounded-xl font-bold text-[14px] bg-[#0284C7] hover:bg-[#0369A1] text-white transition-all cursor-pointer shadow-sm active:scale-[0.99]"
                >
                  Got it
                </button>
                <button
                  type="button"
                  onClick={() => setShowPreviewModal(false)}
                  className="py-3 px-4 rounded-xl font-semibold text-[14px] bg-zinc-100 hover:bg-zinc-200 text-zinc-700 transition-all cursor-pointer"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};
