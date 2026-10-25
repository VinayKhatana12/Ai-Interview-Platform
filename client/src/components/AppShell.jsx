import { NavLink, Outlet } from 'react-router-dom'
import { ChartNoAxesColumn, History, LayoutDashboard, Plus, UserRound } from 'lucide-react'
import { BrandMark } from './BrandMark.jsx'

// Shell per the dealt sheet: an unlabelled icon rail (56px) on the page
// ground with a 1px edge; the active item is a full-bleed tint band with an
// ink icon. On the phone the rail folds into a bottom bar with short labels.
const NAV = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard', short: 'Home', end: true },
  { to: '/interviews/new', icon: Plus, label: 'New interview', short: 'New' },
  { to: '/analytics', icon: ChartNoAxesColumn, label: 'Analytics', short: 'Stats' },
  { to: '/history', icon: History, label: 'History', short: 'History' },
]

// Accepts children so the authed home route can reuse the shell without a
// nested route (falls back to the router Outlet).
function RailItem({ to, icon: Icon, label, short, end, bottom = false }) {
  return (
    <NavLink
      to={to}
      end={end}
      title={label}
      aria-label={label}
      className={({ isActive }) =>
        `group relative flex h-10 w-14 items-center justify-center rounded-[6px] ${
          isActive ? 'bg-ink/[0.06]' : 'hover:bg-ink/[0.04]'
        }`
      }
    >
      {({ isActive }) => (
        <>
          {isActive && (
            <span
              aria-hidden="true"
              className={`absolute ${bottom ? 'bottom-1' : 'top-1'} left-1/2 h-[2px] w-5 -translate-x-1/2 rounded-full bg-ink`}
            />
          )}
          <Icon size={17} strokeWidth={1.5} aria-hidden="true" className={isActive ? 'text-ink' : 'text-muted'} />
          <span className="sr-only">{label}</span>
        </>
      )}
    </NavLink>
  )
}

export default function AppShell({ children }) {
  return (
    <div className="min-h-screen bg-ground">
      {/* Desktop rail */}
      <nav
        aria-label="Main"
        className="fixed inset-y-0 left-0 z-30 hidden w-14 flex-col items-center gap-1 border-r border-line bg-ground py-3 md:flex"
      >
        <BrandMark size={22} />
        <div className="mt-4 flex flex-col gap-1">
          {NAV.map((item) => (
            <RailItem key={item.to} {...item} />
          ))}
        </div>
        <div className="mt-auto flex flex-col gap-1">
          <RailItem to="/profile" icon={UserRound} label="Profile" short="Profile" bottom />
        </div>
      </nav>

      <div className="md:pl-14">
        <main className="mx-auto w-full max-w-[1204px] px-4 pb-24 pt-6 sm:px-6 md:pb-10">
          {children ?? <Outlet />}
        </main>
      </div>

      {/* Phone bottom bar */}
      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-30 flex h-16 items-stretch border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] md:hidden"
      >
        {[...NAV, { to: '/profile', icon: UserRound, label: 'Profile', short: 'Profile' }].map(
          ({ to, icon: Icon, label, short, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              aria-label={label}
              className="flex flex-1 flex-col items-center justify-center gap-1"
            >
              {({ isActive }) => (
                <>
                  <Icon
                    size={18}
                    strokeWidth={1.5}
                    aria-hidden="true"
                    className={isActive ? 'text-ink' : 'text-muted'}
                  />
                  <span className={`text-[11px] ${isActive ? 'text-ink' : 'text-muted'}`}>{short}</span>
                </>
              )}
            </NavLink>
          ),
        )}
      </nav>
    </div>
  )
}
