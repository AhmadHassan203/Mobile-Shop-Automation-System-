import type { SVGProps } from "react";

export type IconProps = SVGProps<SVGSVGElement>;

function baseProps(props: IconProps): IconProps {
  return {
    "aria-hidden": true,
    fill: "none",
    focusable: "false",
    stroke: "currentColor",
    strokeLinecap: "round",
    strokeLinejoin: "round",
    strokeWidth: 1.9,
    viewBox: "0 0 24 24",
    ...props,
  };
}

export function ActivityIcon(props: IconProps) {
  return (
    <svg {...baseProps(props)}>
      <path d="M3 12h4l2.5-7 5 14 2.5-7h4" />
    </svg>
  );
}

export function BoxIcon(props: IconProps) {
  return (
    <svg {...baseProps(props)}>
      <path d="m4 7 8-4 8 4-8 4-8-4Z" />
      <path d="M4 7v10l8 4 8-4V7M12 11v10" />
    </svg>
  );
}

export function LayersIcon(props: IconProps) {
  return (
    <svg {...baseProps(props)}>
      <path d="m12 3-9 5 9 5 9-5-9-5Z" />
      <path d="m3 12 9 5 9-5M3 16l9 5 9-5" />
    </svg>
  );
}

export function DashboardIcon(props: IconProps) {
  return (
    <svg {...baseProps(props)}>
      <path d="M3 3h8v10H3zM13 11h8v10h-8zM3 15h8v6H3zM13 3h8v6h-8z" />
    </svg>
  );
}

export function CartIcon(props: IconProps) {
  return (
    <svg {...baseProps(props)}>
      <path d="M3 3h2l2.4 12.3a2 2 0 0 0 2 1.7h7.7a2 2 0 0 0 2-1.6L22 8H6" />
      <circle cx="9" cy="20" r="1.4" />
      <circle cx="18" cy="20" r="1.4" />
    </svg>
  );
}

export function MessageIcon(props: IconProps) {
  return (
    <svg {...baseProps(props)}>
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      <path d="M12 7v5M12 15h.01" />
    </svg>
  );
}

export function UsersIcon(props: IconProps) {
  return (
    <svg {...baseProps(props)}>
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8" />
    </svg>
  );
}

export function TruckIcon(props: IconProps) {
  return (
    <svg {...baseProps(props)}>
      <path d="M1 3h15v13H1zM16 8h4l3 3v5h-7" />
      <circle cx="5.5" cy="18.5" r="2" />
      <circle cx="18.5" cy="18.5" r="2" />
    </svg>
  );
}

export function ReturnIcon(props: IconProps) {
  return (
    <svg {...baseProps(props)}>
      <path d="M3 7v6h6M3 13a9 9 0 1 0 3-7.7L3 8" />
    </svg>
  );
}

export function WrenchIcon(props: IconProps) {
  return (
    <svg {...baseProps(props)}>
      <path d="M14.7 6.3a4 4 0 0 0-5.4 5.3L3 18v3h3l6.4-6.4a4 4 0 0 0 5.3-5.4l-2.6 2.6-2.3-.4-.4-2.3z" />
    </svg>
  );
}

export function PhoneCheckIcon(props: IconProps) {
  return (
    <svg {...baseProps(props)}>
      <rect height="20" rx="2" width="10" x="7" y="2" />
      <path d="M11 18h2M9 6l2 2 4-4" />
    </svg>
  );
}

export function FinanceIcon(props: IconProps) {
  return (
    <svg {...baseProps(props)}>
      <path d="M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
    </svg>
  );
}

export function CalendarCheckIcon(props: IconProps) {
  return (
    <svg {...baseProps(props)}>
      <rect height="16" rx="2" width="18" x="3" y="4" />
      <path d="M3 10h18M8 2v4M16 2v4M8 15l2 2 4-4" />
    </svg>
  );
}

export function WalletIcon(props: IconProps) {
  return (
    <svg {...baseProps(props)}>
      <rect height="14" rx="2" width="18" x="3" y="5" />
      <path d="M7 9h5M7 13h3M16 10l2 2-2 2" />
    </svg>
  );
}

export function LightbulbIcon(props: IconProps) {
  return (
    <svg {...baseProps(props)}>
      <path d="M12 2a6.5 6.5 0 0 0-3.5 12v3h7v-3A6.5 6.5 0 0 0 12 2zM9 20h6M10 22h4" />
    </svg>
  );
}

export function ChartIcon(props: IconProps) {
  return (
    <svg {...baseProps(props)}>
      <path d="M4 4v16h16M8 16V9M12 16V5M16 16v-4" />
    </svg>
  );
}

export function TasksIcon(props: IconProps) {
  return (
    <svg {...baseProps(props)}>
      <path d="m9 11 3 3 8-8M20 12v6a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h9" />
    </svg>
  );
}

export function SettingsIcon(props: IconProps) {
  return (
    <svg {...baseProps(props)}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.8 1.2v.2a2 2 0 0 1-4 0v-.1A1.7 1.7 0 0 0 8 19.4a1.7 1.7 0 0 0-1.8.3l-.1.1A2 2 0 1 1 3.3 17l.1-.1A1.7 1.7 0 0 0 3.6 15h-.1a2 2 0 0 1 0-4h.1A1.7 1.7 0 0 0 4.6 9.4l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.7 1.7 0 0 0 9 6.6h.1A1.7 1.7 0 0 0 10 3.6v-.1a2 2 0 0 1 4 0v.1a1.7 1.7 0 0 0 2.8 1.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1A1.7 1.7 0 0 0 20.4 9h.1a2 2 0 0 1 0 4h-.1a1.7 1.7 0 0 0-1 2z" />
    </svg>
  );
}

export function AlertTriangleIcon(props: IconProps) {
  return (
    <svg {...baseProps(props)}>
      <path d="M10.3 3.7 2.2 18a2 2 0 0 0 1.7 3h16.2a2 2 0 0 0 1.7-3L13.7 3.7a2 2 0 0 0-3.4 0Z" />
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
    </svg>
  );
}

export function CheckCircleIcon(props: IconProps) {
  return (
    <svg {...baseProps(props)}>
      <circle cx="12" cy="12" r="9" />
      <path d="m8 12 2.6 2.6L16.5 9" />
    </svg>
  );
}

export function ClockIcon(props: IconProps) {
  return (
    <svg {...baseProps(props)}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

export function EyeIcon(props: IconProps) {
  return (
    <svg {...baseProps(props)}>
      <path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" />
      <circle cx="12" cy="12" r="2.5" />
    </svg>
  );
}

export function EyeOffIcon(props: IconProps) {
  return (
    <svg {...baseProps(props)}>
      <path d="m3 3 18 18" />
      <path d="M10.6 6.2A10.4 10.4 0 0 1 12 6c6 0 9.5 6 9.5 6a16 16 0 0 1-2.2 2.9M6.2 6.2A16.7 16.7 0 0 0 2.5 12s3.5 6 9.5 6a9.9 9.9 0 0 0 4.1-.9" />
      <path d="M10.3 10.3a2.5 2.5 0 0 0 3.4 3.4" />
    </svg>
  );
}

export function LockIcon(props: IconProps) {
  return (
    <svg {...baseProps(props)}>
      <rect x="4" y="10" width="16" height="11" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
    </svg>
  );
}

export function LogInIcon(props: IconProps) {
  return (
    <svg {...baseProps(props)}>
      <path d="M14 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
      <path d="m10 17 5-5-5-5M15 12H3" />
    </svg>
  );
}

export function LogOutIcon(props: IconProps) {
  return (
    <svg {...baseProps(props)}>
      <path d="M10 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h4" />
      <path d="m14 17 5-5-5-5M19 12H8" />
    </svg>
  );
}

export function MailIcon(props: IconProps) {
  return (
    <svg {...baseProps(props)}>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m4 7 8 6 8-6" />
    </svg>
  );
}

export function CloseIcon(props: IconProps) {
  return (
    <svg {...baseProps(props)}>
      <path d="m6 6 12 12M18 6 6 18" />
    </svg>
  );
}

export function MenuIcon(props: IconProps) {
  return (
    <svg {...baseProps(props)}>
      <path d="M4 7h16M4 12h16M4 17h16" />
    </svg>
  );
}

export function PlusIcon(props: IconProps) {
  return (
    <svg {...baseProps(props)}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

export function MoonIcon(props: IconProps) {
  return (
    <svg {...baseProps(props)}>
      <path d="M20.6 14.2A8.5 8.5 0 0 1 9.8 3.4 8.5 8.5 0 1 0 20.6 14.2Z" />
    </svg>
  );
}

export function RefreshIcon(props: IconProps) {
  return (
    <svg {...baseProps(props)}>
      <path d="M20 11a8 8 0 1 0-2.3 5.7" />
      <path d="M20 5v6h-6" />
    </svg>
  );
}

export function SearchIcon(props: IconProps) {
  return (
    <svg {...baseProps(props)}>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-4-4" />
    </svg>
  );
}

export function BellIcon(props: IconProps) {
  return (
    <svg {...baseProps(props)}>
      <path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.7 21a2 2 0 0 1-3.4 0" />
    </svg>
  );
}

export function ServerIcon(props: IconProps) {
  return (
    <svg {...baseProps(props)}>
      <rect x="3" y="4" width="18" height="6" rx="2" />
      <rect x="3" y="14" width="18" height="6" rx="2" />
      <path d="M7 7h.01M7 17h.01" />
    </svg>
  );
}

export function ShieldCheckIcon(props: IconProps) {
  return (
    <svg {...baseProps(props)}>
      <path d="M12 3 4.5 6v5.5c0 4.5 3.1 7.7 7.5 9.5 4.4-1.8 7.5-5 7.5-9.5V6L12 3Z" />
      <path d="m8.5 12 2.2 2.2 4.8-5" />
    </svg>
  );
}
