import { useState } from 'react'
import { useSearchParams } from 'react-router'
import { PublicLayout } from '../../components/layout/PublicLayout'
import { publicHeaderNav } from '../../lib/public-navigation'
import { Banner, Button, Card, TextField } from '../../components/ui'
import { toAppError, type AppError } from '../api'
import { ActionFeedback } from '../components/States'
import { verifyCertificate, type Verification } from '../data/certificates'
import { formatDate } from '../learner-model'
import styles from './manage/Certificates.module.css'

/*
 * Public certificate check at /verify-certificate (0026, A11). Anyone with a certificate ID can
 * confirm it was issued. The answer is deliberately minimal: name, course, organization and
 * completion date (certificate-verify; nothing else is ever returned).
 */
export default function LiveVerifyCertificatePage() {
  const [params] = useSearchParams()
  const [code, setCode] = useState(params.get('code') ?? '')
  const [result, setResult] = useState<Verification | null>(null)
  const [error, setError] = useState<AppError | null>(null)
  const [busy, setBusy] = useState(false)

  const check = async () => {
    setBusy(true)
    setError(null)
    setResult(null)
    try {
      setResult(await verifyCertificate(code.trim()))
    } catch (caught) {
      setError(toAppError(caught))
    } finally {
      setBusy(false)
    }
  }

  return (
    <PublicLayout navItems={publicHeaderNav()}>
      <div className={styles.narrow}>
      <Card padding="lg">
        <h1 className="text-h2">Check a certificate</h1>
        <p className={styles.muted}>Enter the certificate ID printed on the certificate.</p>
        <form
          className={styles.form}
          onSubmit={(event) => {
            event.preventDefault()
            void check()
          }}
        >
          <TextField label="Certificate ID" value={code} maxLength={64} autoComplete="off" hint="For example: K7QM-3XPA-9RTD-W2HF" onChange={(e) => setCode(e.target.value)} />
          <div className={styles.actions}>
            <Button type="submit" loading={busy} disabled={code.trim() === ''}>
              Check certificate
            </Button>
          </div>
          <ActionFeedback error={error} />
        </form>
        <div role="status" aria-atomic="true">
          {result?.valid ? (
            <>
              <Banner tone="success" live={false}>
                This certificate is valid.
              </Banner>
              <dl className={styles.verifyResult}>
                <div>
                  <dt>Awarded to</dt>
                  <dd>{result.participantName}</dd>
                </div>
                <div>
                  <dt>Course</dt>
                  <dd>{result.courseTitle}</dd>
                </div>
                <div>
                  <dt>Issued by</dt>
                  <dd>{result.organizationName}</dd>
                </div>
                <div>
                  <dt>Completed</dt>
                  <dd>{formatDate(result.completedOn)}</dd>
                </div>
              </dl>
            </>
          ) : result ? (
            <Banner tone="warning" live={false}>
              We could not find a valid certificate with this ID. Check the ID and try again.
            </Banner>
          ) : null}
        </div>
      </Card>
      </div>
    </PublicLayout>
  )
}
