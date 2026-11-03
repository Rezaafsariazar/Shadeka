import { lazy, Suspense } from 'react'
import { usePlanner } from './hooks/usePlanner'
import { useHashRoute } from './hooks/useHashRoute'
import PlannerPage from './pages/PlannerPage'

// Loaded on demand so the default planner page doesn't pay for it.
const CommandCenterPage = lazy(() => import('./pages/CommandCenterPage'))

export default function App() {
  const planner = usePlanner()
  const page = useHashRoute()

  if (page === 'command') {
    return (
      <Suspense fallback={<div className="h-screen w-screen bg-[#070b10]" />}>
        <CommandCenterPage planner={planner} />
      </Suspense>
    )
  }
  return <PlannerPage planner={planner} />
}
