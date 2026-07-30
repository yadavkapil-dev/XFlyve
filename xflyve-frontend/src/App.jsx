import { Routes, Route } from "react-router-dom";

import LandingPage from "./pages/LandingPage";
import LoginPage from "./pages/auth/LoginPage";
import ForgotPasswordPage from "./pages/auth/ForgotPasswordPage";
import ResetPasswordPage from "./pages/auth/ResetPasswordPage";
import ErrorPage from "./pages/ErrorPage";
import PrivateRoute from "./components/PrivateRoute";
import MainLayout from "./layouts/MainLayout";
import DemoAssistant from "./components/DemoAssistant";

import HomePage from "./pages/HomePage";

// Admin pages
import Jobs from "./pages/admin/Jobs";
import CreateJob from "./pages/admin/CreateJob";
import Trucks from "./pages/admin/Trucks";
import Drivers from "./pages/admin/Drivers";
import AssignTruck from "./pages/admin/AssignTruck";
import WorkDiary from "./pages/admin/WorkDiary";
import WorkLogs from "./pages/admin/WorkLogs";
import PodsList from "./pages/admin/PodsList";
import Invoicing from "./pages/admin/Invoicing";

// Driver pages (import from driver folder)
import DriverHome from "./pages/driver/DriverHome";
import DriverJobs from "./pages/driver/Jobs";
import DriverWorkDiary from "./pages/driver/WorkDiary";
import DriverWorkLogs from "./pages/driver/WorkLogs";
import DriverUploadPod from "./pages/driver/UploadPod.jsx";

function App() {
  return (
    <>
      <Routes>
        {/* Public routes */}
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />

        {/* Protected routes */}
        <Route element={<PrivateRoute allowedRoles={["admin", "driver"]} />}>
          <Route element={<MainLayout />}>
            {/* Shared homepage for admin */}
            <Route path="/home" element={<HomePage />} />

            {/* Admin routes */}
            <Route element={<PrivateRoute allowedRoles={["admin"]} />}>
              <Route path="/jobs" element={<Jobs />} />
              <Route path="/jobs/create" element={<CreateJob />} />
              <Route path="/trucks" element={<Trucks />} />
              <Route path="/drivers" element={<Drivers />} />
              <Route path="/assign-truck" element={<AssignTruck />} />
              <Route path="/logs" element={<WorkLogs />} />
              <Route path="/pods" element={<PodsList />} />
              <Route path="/work-diary" element={<WorkDiary />} />
              <Route path="/invoicing" element={<Invoicing />} />
            </Route>

            {/* Driver routes */}
            <Route element={<PrivateRoute allowedRoles={["driver"]} />}>
              {/* Driver home/dashboard */}
              <Route path="/driver-home" element={<DriverHome />} />

              {/* Driver features under /driver/* path for clarity */}
              <Route path="/driver/jobs" element={<DriverJobs />} />
              <Route path="/driver/work-diary" element={<DriverWorkDiary />} />
              <Route path="/driver/work-diary/:id" element={<DriverWorkDiary />} />
              <Route path="/driver/pods/upload" element={<DriverUploadPod />} />
              <Route path="/driver/pods/upload/:id" element={<DriverUploadPod />} />
              <Route path="/driver/logs" element={<DriverWorkLogs />} />
            </Route>
          </Route>
        </Route>

        {/* Catch-all */}
        <Route path="*" element={<ErrorPage />} />
      </Routes>
      <DemoAssistant />
    </>
  );
}

export default App;
