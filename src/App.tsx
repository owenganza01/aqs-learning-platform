import { lazy, Suspense } from 'react'
import { BrowserRouter, Route, Routes } from 'react-router'
import { HomePlaceholder } from './pages/HomePlaceholder'
import { NotFound } from './pages/NotFound'

/*
 * The design-system preview is a development tool, not a product page.
 * `import.meta.env.DEV` is true only under `npm run dev`, so the preview —
 * and its code — is left out of production builds (`npm run build`).
 */
const DesignSystemPage = import.meta.env.DEV
  ? lazy(() => import('./dev/design-system/DesignSystemPage'))
  : null

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePlaceholder />} />
        {DesignSystemPage ? (
          <Route
            path="/design-system"
            element={
              <Suspense fallback={<p style={{ padding: 24 }}>Loading design system…</p>}>
                <DesignSystemPage />
              </Suspense>
            }
          />
        ) : null}
        <Route path="*" element={<NotFound />} />
      </Routes>
    </BrowserRouter>
  )
}
