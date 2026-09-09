import React, { useState } from 'react';
import { Package } from 'lucide-react';

interface ProductThumbnailProps {
  src?: string | null;
  alt: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

const SIZE_MAP = {
  sm: 'w-9 h-9 min-w-9 rounded-lg',
  md: 'w-11 h-11 min-w-11 rounded-xl',
  lg: 'w-14 h-14 min-w-14 rounded-2xl',
  xl: 'w-20 h-20 min-w-20 rounded-2xl',
};

const ICON_SIZE_MAP = {
  sm: 15,
  md: 18,
  lg: 22,
  xl: 30,
};

export const ProductThumbnail: React.FC<ProductThumbnailProps> = ({
  src,
  alt,
  size = 'md',
  className = '',
}) => {
  const [hasError, setHasError] = useState(false);

  const containerClasses = `${SIZE_MAP[size]} overflow-hidden flex-shrink-0 flex items-center justify-center bg-[#F2F4F2] border border-[#DEE3DE] ${className}`;

  if (!src || hasError) {
    return (
      <div className={containerClasses} aria-hidden="true">
        <Package
          size={ICON_SIZE_MAP[size]}
          strokeWidth={1.75}
          className="text-[#6E746F]"
        />
      </div>
    );
  }

  return (
    <div className={containerClasses}>
      <img
        src={src}
        alt={alt}
        loading="lazy"
        decoding="async"
        onError={() => setHasError(true)}
        className="w-full h-full object-cover object-center"
      />
    </div>
  );
};
