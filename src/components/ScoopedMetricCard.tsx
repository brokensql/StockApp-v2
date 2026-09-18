import React, { useRef, useState, useEffect } from 'react';
import { Info } from 'lucide-react';

export interface ScoopedMetricCardProps {
  id?: string;
  value: React.ReactNode;
  title?: string;
  titleLine1?: string;
  titleLine2?: string;
  subtitle: string;
  badgeIcon: React.ReactNode;
  badgeVariant?: 'stats-green' | 'white' | 'blue' | 'amber' | 'green' | 'purple' | 'green-mint' | 'green-sage';
  onClick?: () => void;
  onInfoClick?: () => void;
}

export const ScoopedMetricCard: React.FC<ScoopedMetricCardProps> = ({
  id,
  value,
  title = '',
  titleLine1,
  titleLine2,
  subtitle,
  badgeIcon,
  badgeVariant = 'stats-green',
  onClick,
  onInfoClick,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState<{ width: number; height: number }>({
    width: 175,
    height: 142,
  });

  // Determine line 1 and line 2 for the title
  let line1 = titleLine1;
  let line2 = titleLine2;
  if (!line1 && !line2 && title) {
    const parts = title.split(' ');
    line1 = parts[0] || '';
    line2 = parts.slice(1).join(' ') || '';
  }

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const updateSize = () => {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        setDimensions({
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        });
      }
    };

    updateSize();

    const resizeObserver = new ResizeObserver(updateSize);
    resizeObserver.observe(el);

    return () => resizeObserver.disconnect();
  }, []);

  const { width: W, height: H } = dimensions;

  // Geometry configuration
  // Outer corner radii
  const R_corner = 26;
  // Center of circular badge & scoop
  const cx = 27;
  const cy = 27;
  // Radius of the scoop cutout
  const R_cutout = 32;
  // Radius of the transition fillets
  const r_fillet = 10;

  // Compute smooth geometric fillet transitions
  // Top fillet: tangent to line y = 0 and circle centered at (W - cx, cy) with radius R_cutout
  // Fillet circle center is at y = r_fillet, distance to (W - cx, cy) is (R_cutout + r_fillet)
  const distCenters = R_cutout + r_fillet;
  const dyTop = cy - r_fillet;
  const dxTop = Math.sqrt(Math.max(0, distCenters * distCenters - dyTop * dyTop));
  const x_f1_start = W - cx - dxTop;
  const t_top = r_fillet / distCenters;
  const x_cutout_start = x_f1_start + t_top * dxTop;
  const y_cutout_start = r_fillet + t_top * dyTop;

  // Right fillet: tangent to line x = W and circle centered at (W - cx, cy) with radius R_cutout
  // Fillet circle center is at x = W - r_fillet, distance to (W - cx, cy) is (R_cutout + r_fillet)
  const dxRight = (W - r_fillet) - (W - cx); // cx - r_fillet
  const dyRight = Math.sqrt(Math.max(0, distCenters * distCenters - dxRight * dxRight));
  const y_f2_end = cy + dyRight;
  const t_right = R_cutout / distCenters;
  const x_cutout_end = (W - cx) + t_right * dxRight;
  const y_cutout_end = cy + t_right * dyRight;

  // Generate continuous SVG path
  const pathD = `
    M ${R_corner} 0
    L ${x_f1_start.toFixed(2)} 0
    A ${r_fillet} ${r_fillet} 0 0 1 ${x_cutout_start.toFixed(2)} ${y_cutout_start.toFixed(2)}
    A ${R_cutout} ${R_cutout} 0 0 0 ${x_cutout_end.toFixed(2)} ${y_cutout_end.toFixed(2)}
    A ${r_fillet} ${r_fillet} 0 0 1 ${W} ${y_f2_end.toFixed(2)}
    L ${W} ${(H - R_corner).toFixed(2)}
    A ${R_corner} ${R_corner} 0 0 1 ${(W - R_corner).toFixed(2)} ${H}
    L ${R_corner} ${H}
    A ${R_corner} ${R_corner} 0 0 1 0 ${(H - R_corner).toFixed(2)}
    L 0 ${R_corner}
    A ${R_corner} ${R_corner} 0 0 1 ${R_corner} 0
    Z
  `;

  // Badge gradient & shadow profiles based on variant
  const getBadgeStyle = () => {
    switch (badgeVariant) {
      case 'stats-green':
        return {
          background: '#E8F3E8',
          boxShadow: '0 2px 6px rgba(47, 125, 50, 0.10), inset 0 0 0 1px #D6E8D6',
          color: '#2F7D32',
        };
      case 'green-mint':
        return {
          background: 'radial-gradient(circle at 35% 30%, #E0F4E5 0%, #C8E8CF 55%, #B4DEBC 100%)',
          boxShadow: '0 3px 10px rgba(47, 125, 50, 0.16), inset 0 1px 2px rgba(255, 255, 255, 0.7), inset 0 0 0 1px #8ECB97',
          color: '#1E5A22',
        };
      case 'green-sage':
        return {
          background: 'radial-gradient(circle at 35% 30%, #E8F2DF 0%, #D4E6C5 55%, #C0DBAD 100%)',
          boxShadow: '0 3px 10px rgba(58, 105, 45, 0.16), inset 0 1px 2px rgba(255, 255, 255, 0.7), inset 0 0 0 1px #9EC588',
          color: '#256B29',
        };
      case 'green':
        return {
          background: 'radial-gradient(circle at 35% 30%, #43A047 0%, #2F7D32 60%, #1E5A22 100%)',
          boxShadow: '0 4px 10px rgba(47, 125, 50, 0.35), inset 0 1px 2px rgba(255, 255, 255, 0.5), inset 0 -1px 2px rgba(0, 0, 0, 0.15)',
          color: '#FFFFFF',
        };
      case 'white':
        return {
          background: '#FFFFFF',
          boxShadow: '0 2px 8px rgba(32, 37, 34, 0.07), inset 0 0 0 1px #DEE3DE',
          color: '#2F7D32',
        };
      case 'amber':
        return {
          background: 'radial-gradient(circle at 35% 30%, #F5B041 0%, #E67E22 60%, #CF6D17 100%)',
          boxShadow: '0 4px 10px rgba(230, 126, 34, 0.35), inset 0 1px 2px rgba(255, 255, 255, 0.5), inset 0 -1px 2px rgba(0, 0, 0, 0.1)',
          color: '#FFFFFF',
        };
      case 'purple':
        return {
          background: 'radial-gradient(circle at 35% 30%, #8E79B5 0%, #7158A0 60%, #594285 100%)',
          boxShadow: '0 4px 10px rgba(113, 88, 160, 0.35), inset 0 1px 2px rgba(255, 255, 255, 0.5), inset 0 -1px 2px rgba(0, 0, 0, 0.1)',
          color: '#FFFFFF',
        };
      case 'blue':
        return {
          background: 'radial-gradient(circle at 35% 30%, #688FB9 0%, #4D749E 60%, #395B82 100%)',
          boxShadow: '0 4px 10px rgba(77, 116, 158, 0.35), inset 0 1px 2px rgba(255, 255, 255, 0.5), inset 0 -1px 2px rgba(0, 0, 0, 0.1)',
          color: '#FFFFFF',
        };
      default:
        return {
          background: '#E8F3E8',
          boxShadow: '0 2px 6px rgba(47, 125, 50, 0.10), inset 0 0 0 1px #D6E8D6',
          color: '#2F7D32',
        };
    }
  };

  return (
    <div
      id={id}
      ref={containerRef}
      onClick={onClick}
      className="relative w-full min-h-[138px] sm:min-h-[144px] cursor-pointer select-none transition-transform duration-200 active:scale-[0.985] group"
    >
      {/* Dynamic Background SVG with Cutout Notch & Soft Elevation */}
      <svg
        className="absolute inset-0 w-full h-full overflow-visible pointer-events-none"
        style={{
          filter: 'drop-shadow(0 4px 14px rgba(32, 37, 34, 0.04)) drop-shadow(0 1px 3px rgba(32, 37, 34, 0.02))',
        }}
      >
        <path
          d={pathD}
          fill="#FFFFFF"
          stroke="#E5E8E5"
          strokeWidth="1"
          className="transition-colors duration-200 group-hover:stroke-[#2F7D32]/30"
        />
      </svg>

      {/* 3D Circular Floating Badge nestled inside the scooped notch */}
      <div
        className="absolute w-[46px] h-[46px] rounded-full flex items-center justify-center z-10 transition-transform duration-200 group-hover:scale-105"
        style={{
          top: `${cy - 23}px`,
          right: `${cx - 23}px`,
          ...getBadgeStyle(),
        }}
      >
        {badgeIcon}
      </div>

      {/* Card Content Layout */}
      <div className="relative z-10 w-full h-full flex flex-col justify-between p-3.5 sm:p-4 pt-3.5 pb-3">
        {/* Top: 2-line Title ("Total" \n "Sales") */}
        <div className="pr-12">
          <div className="flex flex-col">
            <span className="text-[14px] sm:text-[15px] font-semibold text-[#202522] tracking-[-0.015em] leading-[1.15]">
              {line1}
            </span>
            <div className="flex items-center gap-1 mt-0.5">
              <span className="text-[14px] sm:text-[15px] font-semibold text-[#202522] tracking-[-0.015em] leading-[1.15]">
                {line2}
              </span>
              {onInfoClick && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onInfoClick();
                  }}
                  className="text-[#68716C] hover:text-[#202522] transition-colors p-0.5 cursor-pointer flex-shrink-0"
                  aria-label={`Info about ${line1} ${line2}`}
                >
                  <Info size={13} strokeWidth={2.2} />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Middle: Number / Metric Value (Reduced clean semi-bold font size) */}
        <div className="my-auto py-0.5">
          <div className="text-[19.5px] sm:text-[21.5px] font-semibold text-[#202522] tracking-[-0.025em] tabular-nums leading-tight">
            {value}
          </div>
        </div>

        {/* Bottom: Subtitle */}
        <div className="mt-auto">
          <p className="text-[11px] sm:text-[11.5px] text-[#68716C] leading-snug font-normal truncate">
            {subtitle}
          </p>
        </div>
      </div>
    </div>
  );
};
