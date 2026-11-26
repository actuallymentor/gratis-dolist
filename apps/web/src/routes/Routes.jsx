import { Navigate, Route, Routes } from 'react-router'
import TriagePage from '../components/pages/TriagePage'
import HorizonsPage from '../components/pages/HorizonsPage'
import SettingsPage from '../components/pages/SettingsPage'
import SearchPage from '../components/pages/SearchPage'
import CompletedPage from '../components/pages/CompletedPage'
import CapturePage from '../components/pages/CapturePage'
import SignInPage from '../components/pages/SignInPage'
import ProjectsPage from '../components/pages/ProjectsPage'
import ProjectPage from '../components/pages/ProjectPage'

export default function AppRoutes() {
    return <Routes>
        <Route path="/" element={ <Navigate to="/horizons" replace /> } />
        <Route path="/capture" element={ <CapturePage /> } />
        <Route path="/triage" element={ <TriagePage /> } />
        <Route path="/inbox" element={ <Navigate to="/triage" replace /> } />
        <Route path="/today" element={ <Navigate to="/horizons" replace /> } />
        <Route path="/horizons" element={ <HorizonsPage /> } />
        <Route path="/horizons/:project_id" element={ <HorizonsPage /> } />
        <Route path="/projects" element={ <ProjectsPage /> } />
        <Route path="/projects/:id" element={ <ProjectPage /> } />
        <Route path="/search" element={ <SearchPage /> } />
        <Route path="/completed" element={ <CompletedPage /> } />
        <Route path="/settings" element={ <SettingsPage /> } />
        <Route path="/signin" element={ <SignInPage /> } />
        <Route path="*" element={ <Navigate to="/horizons" replace /> } />
    </Routes>
}
