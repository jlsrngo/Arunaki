import React from "react";

interface ArunakiLogoProps {
  className?: string;
  size?: number | string;
  fill?: string;
}

export const ArunakiLogo: React.FC<ArunakiLogoProps> = ({
  className = "w-6 h-6",
  size,
  fill = "currentColor",
}) => {
  const sizeStyle = size ? { width: size, height: size } : undefined;

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 6821.37 6210.13"
      className={className}
      style={sizeStyle}
      fill={fill}
    >
      <path d="M879.14 4373.85l2374.82 0c483.53,0 879.14,395.61 879.14,879.14l0 0.01c0,483.53 -395.61,879.14 -879.14,879.14l-2374.82 0c-483.53,0 -879.14,-395.61 -879.14,-879.14l0 -0.01c0,-483.53 395.61,-879.14 879.14,-879.14zm1792.3 -3925.98l-1211.69 2098.71c-246.72,427.32 -98.95,978.78 328.37,1225.49l0.01 0.01c427.31,246.71 978.77,98.94 1225.49,-328.38l1211.69 -2098.71c246.71,-427.31 98.94,-978.78 -328.37,-1225.49l0 0c-427.32,-246.71 -978.79,-98.94 -1225.49,328.37zm2818.73 2318.55l1211.69 2098.71c246.72,427.32 98.95,978.78 -328.37,1225.49l-0.01 0.01c-427.31,246.71 -978.77,98.94 -1225.49,-328.38l-1211.69 -2098.71c-246.71,-427.31 -98.94,-978.78 328.37,-1225.49l0 0c427.32,-246.71 978.79,-98.94 1225.49,328.37z" />
    </svg>
  );
};
