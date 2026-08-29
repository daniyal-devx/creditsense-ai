'use client'

import * as React from 'react'
import type { ColumnDef } from '@tanstack/react-table'
import {
  ArrowRight,
  Ban,
  CheckCircle2,
  Download,
  Filter,
  Plus,
  Search,
  Trash2,
} from 'lucide-react'
import { PageHeader, Section, StickyActionBar } from '@/components/layout/page-header'
import { ThemeSegmentedControl } from '@/components/layout/theme-toggle'
import { RiskBadge } from '@/components/risk/risk-badge'
import { Alert } from '@/components/ui/alert'
import { Avatar } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardFooter, CardHeaderRow } from '@/components/ui/card'
import { Checkbox, Switch } from '@/components/ui/checkbox'
import { DataTable } from '@/components/ui/data-table'
import { Input, Textarea } from '@/components/ui/input'
import { ConfirmModal, Modal } from '@/components/ui/modal'
import { Progress, SegmentedBar } from '@/components/ui/progress'
import { Select } from '@/components/ui/select'
import { SkeletonCard, SkeletonStat, SkeletonText } from '@/components/ui/skeleton'
import {
  EmptyState,
  ErrorState,
  NoPermissionState,
  NoResultsState,
} from '@/components/ui/states'
import { Tab, TabList, TabPanel, Tabs } from '@/components/ui/tabs'
import { useToast } from '@/components/ui/toast'
import { InfoTip, Tooltip } from '@/components/ui/tooltip'
import { RISK_BANDS } from '@/lib/risk'
import { formatPKR, formatPKRCompact, formatPercent } from '@/lib/utils/format'

/**
 * The component gallery.
 *
 * This is Phase 0's proof: every shared primitive rendered together, so a
 * regression in one is obvious, and so the whole set can be checked at 320px
 * and at 1440px in both themes in a single pass.
 */

interface DemoRow {
  id: string
  name: string
  occupation: string
  score: number
  income: number
  submitted: string
}

const DEMO_ROWS: DemoRow[] = [
  { id: 'a1', name: 'Ayesha Khan', occupation: 'Freelance designer', score: 812, income: 68000, submitted: '2 hours ago' },
  { id: 'a2', name: 'Bilal Ahmed', occupation: 'Shopkeeper', score: 645, income: 92000, submitted: '5 hours ago' },
  { id: 'a3', name: 'Hina Raza', occupation: 'Online seller', score: 918, income: 145000, submitted: 'Yesterday' },
  { id: 'a4', name: 'Usman Tariq', occupation: 'Ride-hailing driver', score: 487, income: 54000, submitted: 'Yesterday' },
  { id: 'a5', name: 'Sana Malik', occupation: 'Tailor', score: 352, income: 31000, submitted: '2 days ago' },
]

export default function DesignSystemPage() {
  const toast = useToast()
  const [modalOpen, setModalOpen] = React.useState(false)
  const [confirmOpen, setConfirmOpen] = React.useState(false)
  const [confirming, setConfirming] = React.useState(false)
  const [loadingBtn, setLoadingBtn] = React.useState(false)

  const columns = React.useMemo<ColumnDef<DemoRow, unknown>[]>(
    () => [
      {
        accessorKey: 'name',
        header: 'Applicant',
        cell: ({ row }) => (
          <div className="flex items-center gap-3">
            <Avatar name={row.original.name} size="sm" />
            <div className="min-w-0">
              <p className="truncate font-medium">{row.original.name}</p>
              <p className="truncate text-xs text-muted-foreground">{row.original.occupation}</p>
            </div>
          </div>
        ),
      },
      {
        accessorKey: 'score',
        header: 'Score',
        cell: ({ row }) => (
          <span className="font-semibold tabular-nums">{row.original.score}</span>
        ),
      },
      {
        id: 'band',
        header: 'Risk band',
        cell: ({ row }) => <RiskBadge score={row.original.score} size="sm" />,
      },
      {
        accessorKey: 'income',
        header: 'Monthly income',
        cell: ({ row }) => (
          <span className="tabular-nums">{formatPKR(row.original.income)}</span>
        ),
      },
      { accessorKey: 'submitted', header: 'Submitted' },
    ],
    [],
  )

  return (
    <>
      <PageHeader
        title="Design system"
        description="Every shared component, rendered together. Check this page at 320px and 1440px in both themes — if it holds here, it holds everywhere."
        breadcrumbs={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Design system' }]}
        badge={<Badge tone="primary">Phase 0</Badge>}
        actions={
          <>
            <Button variant="secondary" leadingIcon={<Download className="size-4" />}>
              Export
            </Button>
            <Button leadingIcon={<Plus className="size-4" />}>New application</Button>
          </>
        }
      />

      <div className="flex flex-col gap-10 pb-4">
        {/* ============ THEME ============ */}
        <Section title="Theme" description="Light, dark and follow-the-system. Every token is defined for all three.">
          <ThemeSegmentedControl />
        </Section>

        {/* ============ COLOUR TOKENS ============ */}
        <Section
          title="Colour tokens"
          description="Semantic names, never raw hex values. Swapping a token here restyles the whole product."
        >
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {[
              ['Background', 'bg-background border border-border'],
              ['Surface', 'bg-surface border border-border'],
              ['Surface sunken', 'bg-surface-sunken border border-border'],
              ['Muted', 'bg-muted border border-border'],
              ['Primary', 'bg-primary'],
              ['Success', 'bg-success'],
              ['Warning', 'bg-warning'],
              ['Danger', 'bg-danger'],
              ['Info', 'bg-info'],
              ['Chart 1', 'bg-chart-1'],
              ['Chart 2', 'bg-chart-2'],
              ['Chart 3', 'bg-chart-3'],
            ].map(([label, cls]) => (
              <div key={label} className="min-w-0">
                <div className={`h-14 rounded-lg ${cls}`} />
                <p className="mt-1.5 truncate text-xs font-medium text-muted-foreground">{label}</p>
              </div>
            ))}
          </div>
        </Section>

        {/* ============ RISK BANDS ============ */}
        <Section
          title="Risk bands"
          description="Colour never carries the meaning alone. Every band ships with an icon and a label, so it survives colour-blindness and greyscale printing."
        >
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {RISK_BANDS.map((band) => (
              <Card key={band.id}>
                <CardContent className="p-4 pt-4 sm:p-5 sm:pt-5">
                  <div className="flex items-center justify-between gap-2">
                    <RiskBadge band={band} />
                    <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                      {band.min}–{band.max}
                    </span>
                  </div>
                  <p className="mt-3 text-sm font-medium">{band.verdict}</p>
                  <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                    {band.description}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="mt-4">
            <p className="mb-2 text-sm font-medium">Portfolio composition</p>
            <SegmentedBar
              label="Portfolio by risk band"
              size="lg"
              segments={[
                { key: 'vl', value: 18, className: 'bg-risk-verylow', label: 'Very low' },
                { key: 'l', value: 34, className: 'bg-risk-low', label: 'Low' },
                { key: 'm', value: 28, className: 'bg-risk-moderate', label: 'Moderate' },
                { key: 'h', value: 14, className: 'bg-risk-high', label: 'High' },
                { key: 'vh', value: 6, className: 'bg-risk-veryhigh', label: 'Very high' },
              ]}
            />
          </div>
        </Section>

        {/* ============ TYPOGRAPHY ============ */}
        <Section title="Typography & numbers" description="Financial figures always use tabular numerals so columns align.">
          <Card>
            <CardContent className="flex flex-col gap-4 p-4 pt-4 sm:p-5 sm:pt-5">
              <div>
                <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Page title</h1>
                <h2 className="mt-2 text-base font-semibold sm:text-lg">Section heading</h2>
                <p className="mt-2 max-w-prose text-sm leading-relaxed text-muted-foreground">
                  Body copy. Plain language over jargon — &ldquo;likely to repay&rdquo; beats
                  &ldquo;PD = 0.08&rdquo;. Every explanation in this product should be readable
                  aloud to the applicant it describes.
                </p>
              </div>
              <dl className="grid grid-cols-2 gap-4 border-t border-border pt-4 sm:grid-cols-4">
                {[
                  ['Full amount', formatPKR(1_250_000)],
                  ['Compact', formatPKRCompact(1_250_000)],
                  ['Instalment', formatPKR(18_450)],
                  ['Default rate', formatPercent(0.0842)],
                ].map(([label, value]) => (
                  <div key={label}>
                    <dt className="text-xs text-muted-foreground">{label}</dt>
                    <dd className="mt-0.5 text-lg font-semibold tabular-nums">{value}</dd>
                  </div>
                ))}
              </dl>
            </CardContent>
          </Card>
        </Section>

        {/* ============ BUTTONS ============ */}
        <Section title="Buttons" description="44px tall on mobile, 40px from sm: upward. Loading state keeps the width stable.">
          <Card>
            <CardContent className="flex flex-col gap-5 p-4 pt-4 sm:p-5 sm:pt-5">
              <div className="flex flex-wrap gap-2">
                <Button>Primary</Button>
                <Button variant="secondary">Secondary</Button>
                <Button variant="outline">Outline</Button>
                <Button variant="ghost">Ghost</Button>
                <Button variant="success" leadingIcon={<CheckCircle2 className="size-4" />}>
                  Approve
                </Button>
                <Button variant="danger" leadingIcon={<Ban className="size-4" />}>
                  Reject
                </Button>
                <Button variant="link">Link button</Button>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button size="sm">Small</Button>
                <Button size="md">Medium</Button>
                <Button size="lg">Large</Button>
                <Button size="icon" aria-label="Search">
                  <Search className="size-4" />
                </Button>
                <Button size="icon-sm" variant="ghost" aria-label="Filter">
                  <Filter className="size-4" />
                </Button>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button disabled>Disabled</Button>
                <Button
                  loading={loadingBtn}
                  onClick={() => {
                    setLoadingBtn(true)
                    setTimeout(() => setLoadingBtn(false), 1600)
                  }}
                >
                  Click to load
                </Button>
                <Button trailingIcon={<ArrowRight className="size-4" />}>Continue</Button>
              </div>

              <Button fullWidth>Full width — the mobile default for a primary action</Button>
            </CardContent>
          </Card>
        </Section>

        {/* ============ FORMS ============ */}
        <Section title="Form controls" description="Labels, hints and errors are wired to the input through ARIA every time.">
          <Card>
            <CardContent className="grid gap-5 p-4 pt-4 sm:grid-cols-2 sm:p-5 sm:pt-5">
              <Input label="Applicant name" placeholder="e.g. Ayesha Khan" required />
              <Input
                label="Monthly income"
                type="number"
                prefix="Rs"
                hint="Estimated from wallet inflows"
                placeholder="45,000"
              />
              <Input
                label="Email"
                type="email"
                defaultValue="not-an-email"
                error="Enter a valid email address."
              />
              <Input
                label="Search applicants"
                type="search"
                leadingIcon={<Search />}
                placeholder="Name or CNIC"
              />
              <Select
                label="Risk band"
                placeholder="Any band"
                options={RISK_BANDS.map((b) => ({ value: b.id, label: b.label }))}
              />
              <Select
                label="Decision"
                options={[
                  { value: 'approve', label: 'Approve' },
                  { value: 'review', label: 'Send to manual review' },
                  { value: 'reject', label: 'Reject' },
                ]}
              />
              <Textarea
                label="Decision reasoning"
                hint="Captured in the audit trail."
                placeholder="Why are you making this decision?"
                containerClassName="sm:col-span-2"
              />
              <div className="flex flex-col gap-4 sm:col-span-2">
                <Checkbox
                  label="Flag for fraud review"
                  description="Sends this application to the Fraud Analyst queue."
                />
                <Checkbox label="Partially selected" indeterminate />
                <Checkbox label="Disabled option" disabled />
                <Switch
                  label="Email me early-warning alerts"
                  description="Sent when a customer's score deteriorates after disbursement."
                  defaultChecked
                />
              </div>
            </CardContent>
          </Card>
        </Section>

        {/* ============ BADGES / AVATARS / TOOLTIP ============ */}
        <Section title="Badges, avatars & tooltips">
          <Card>
            <CardContent className="flex flex-col gap-5 p-4 pt-4 sm:p-5 sm:pt-5">
              <div className="flex flex-wrap gap-2">
                <Badge>Neutral</Badge>
                <Badge tone="primary">Primary</Badge>
                <Badge tone="success" icon={<CheckCircle2 />}>Approved</Badge>
                <Badge tone="warning" dot>Pending review</Badge>
                <Badge tone="danger">Rejected</Badge>
                <Badge tone="info" variant="outline">Outline</Badge>
                <Badge tone="primary" variant="solid">Solid</Badge>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                {['Ayesha Khan', 'Bilal Ahmed', 'Hina Raza', 'Usman Tariq'].map((n) => (
                  <div key={n} className="flex items-center gap-2">
                    <Avatar name={n} />
                    <span className="text-sm">{n}</span>
                  </div>
                ))}
              </div>

              <div className="flex items-center gap-2 text-sm">
                <span className="font-medium">Debt-service ratio</span>
                <InfoTip
                  label="What is the debt-service ratio?"
                  content="The share of monthly income that would go to the loan instalment. We keep it under 35% so a bad month does not cause a default."
                />
                <span className="ml-auto">
                  <Tooltip content="Tap or hover — both work.">
                    <span className="text-sm underline decoration-dotted underline-offset-4">
                      Hover or tap me
                    </span>
                  </Tooltip>
                </span>
              </div>
            </CardContent>
          </Card>
        </Section>

        {/* ============ PROGRESS ============ */}
        <Section title="Progress & meters">
          <Card>
            <CardContent className="flex flex-col gap-5 p-4 pt-4 sm:p-5 sm:pt-5">
              <Progress label="Affordability used" value={62} valueLabel="Rs 12,400 of Rs 20,000" />
              <Progress label="Bills paid on time" value={11} max={12} tone="success" valueLabel="11 of 12 months" />
              <Progress label="Income volatility" value={78} tone="warning" valueLabel="High" />
              <Progress label="Fraud signals matched" value={3} max={12} tone="danger" valueLabel="3 of 12" />
            </CardContent>
          </Card>
        </Section>

        {/* ============ ALERTS ============ */}
        <Section title="Alerts" description="Part of the page, unlike a toast. Use for a condition of the view.">
          <div className="flex flex-col gap-3">
            <Alert tone="info" title="12 applications are waiting">
              Three have been in the queue for more than 48 hours.
            </Alert>
            <Alert tone="success" title="Decision recorded">
              Ayesha Khan&apos;s application was approved at Rs 45,000 over 12 months.
            </Alert>
            <Alert
              tone="warning"
              title="Income dropped sharply"
              actions={<Button size="sm" variant="secondary">Review customer</Button>}
            >
              Usman Tariq&apos;s wallet inflows fell 41% over the last 60 days.
            </Alert>
            <Alert tone="danger" title="Fraud ring detected">
              Four applications share a device fingerprint and two phone numbers.
            </Alert>
          </div>
        </Section>

        {/* ============ TABS ============ */}
        <Section title="Tabs" description="Arrow keys, Home and End all work. The list scrolls sideways on a narrow screen instead of squashing.">
          <Card>
            <CardContent className="p-4 pt-4 sm:p-5 sm:pt-5">
              <Tabs defaultValue="score">
                <TabList aria-label="Applicant sections">
                  <Tab value="score">Score</Tab>
                  <Tab value="afford">Affordability</Tab>
                  <Tab value="fraud" badge={<Badge tone="danger" size="sm">2</Badge>}>
                    Fraud
                  </Tab>
                  <Tab value="history">History</Tab>
                  <Tab value="docs" disabled>
                    Documents
                  </Tab>
                </TabList>
                <TabPanel value="score">
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    The 0–1000 CreditSense Score and its contributing factors. Built in Phase 3.
                  </p>
                </TabPanel>
                <TabPanel value="afford">
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    Safe loan ceiling and recommended instalment. Built in Phase 4.
                  </p>
                </TabPanel>
                <TabPanel value="fraud">
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    Anomaly flags and the relationship graph. Built in Phase 5.
                  </p>
                </TabPanel>
                <TabPanel value="history">
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    Wallet, top-up and bill payment history. Built in Phase 1.
                  </p>
                </TabPanel>
              </Tabs>
            </CardContent>
          </Card>
        </Section>

        {/* ============ OVERLAYS ============ */}
        <Section title="Modals & toasts" description="Modals become a bottom sheet on mobile. Toasts sit above the bottom nav.">
          <Card>
            <CardContent className="flex flex-wrap gap-2 p-4 pt-4 sm:p-5 sm:pt-5">
              <Button variant="secondary" onClick={() => setModalOpen(true)}>
                Open modal
              </Button>
              <Button variant="danger" onClick={() => setConfirmOpen(true)}>
                Destructive confirm
              </Button>
              <Button variant="secondary" onClick={() => toast.success('Application approved', 'Rs 45,000 over 12 months.')}>
                Success toast
              </Button>
              <Button variant="secondary" onClick={() => toast.error('Could not save decision', 'The database rejected the write. Nothing was changed.')}>
                Error toast
              </Button>
              <Button variant="secondary" onClick={() => toast.warning('Income dropped 41%', 'Usman Tariq, last 60 days.')}>
                Warning toast
              </Button>
              <Button variant="secondary" onClick={() => toast.info('Re-scoring started', ' 1,284 customers queued.')}>
                Info toast
              </Button>
            </CardContent>
          </Card>
        </Section>

        {/* ============ DATA TABLE ============ */}
        <Section
          title="Data table"
          description="A full sortable table from md: upward, stacked cards below it. Resize the window and watch it switch."
        >
          <DataTable
            caption="Demo applications"
            data={DEMO_ROWS}
            columns={columns}
            getRowId={(row) => row.id}
            searchable
            searchPlaceholder="Search by name or occupation…"
            pageSize={5}
            renderMobileCard={(row) => (
              <Card className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <Avatar name={row.name} size="sm" />
                    <div className="min-w-0">
                      <p className="truncate font-medium">{row.name}</p>
                      <p className="truncate text-xs text-muted-foreground">{row.occupation}</p>
                    </div>
                  </div>
                  <span className="shrink-0 text-lg font-semibold tabular-nums">{row.score}</span>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <RiskBadge score={row.score} size="sm" />
                  <span className="text-xs text-muted-foreground">
                    {formatPKR(row.income)}/mo · {row.submitted}
                  </span>
                </div>
              </Card>
            )}
          />
        </Section>

        {/* ============ LOADING ============ */}
        <Section title="Loading states" description="Skeletons, not spinners — they hold the layout so nothing jumps when data lands.">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <SkeletonStat />
            <SkeletonCard />
            <Card>
              <CardContent className="p-4 pt-4 sm:p-5 sm:pt-5">
                <SkeletonText lines={5} />
              </CardContent>
            </Card>
          </div>
        </Section>

        {/* ============ EMPTY / ERROR ============ */}
        <Section
          title="Empty, error & permission states"
          description="Never a blank screen. Each of these tells the user something different, and asks for a different reaction."
        >
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <EmptyState
                title="No applications in your queue"
                description="New applications appear here as soon as they are submitted."
                action={<Button leadingIcon={<Plus className="size-4" />}>Add test applicant</Button>}
              />
            </Card>
            <Card>
              <NoResultsState onClear={() => toast.info('Filters cleared')} />
            </Card>
            <Card>
              <ErrorState onRetry={() => toast.info('Retrying…')} />
            </Card>
            <Card>
              <NoPermissionState requiredRole="Fraud Analyst" />
            </Card>
          </div>
        </Section>

        {/* ============ STICKY ACTIONS ============ */}
        <Section
          title="Sticky action bar"
          description="On a phone this pins above the bottom nav so approve and reject are always in thumb reach. On desktop it sits inline."
        >
          <Card>
            <CardHeaderRow
              title="Ayesha Khan"
              description="Freelance designer · Applying for Rs 45,000"
              actions={<RiskBadge score={812} />}
            />
            <CardContent>
              <p className="text-sm leading-relaxed text-muted-foreground">
                A real decision screen puts the score, the affordability figure and the fraud flags
                above this bar. Built out in Phase 7.
              </p>
            </CardContent>
            <CardFooter>
              <Button variant="secondary" fullWidth className="sm:w-auto">
                Send to review
              </Button>
              <Button variant="danger" fullWidth className="sm:w-auto">
                Reject
              </Button>
              <Button variant="success" fullWidth className="sm:w-auto">
                Approve
              </Button>
            </CardFooter>
          </Card>
        </Section>
      </div>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Send to manual review"
        description="The application moves out of your queue and into the senior review list."
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalOpen(false)} fullWidth className="sm:w-auto">
              Cancel
            </Button>
            <Button
              onClick={() => {
                setModalOpen(false)
                toast.success('Sent to manual review')
              }}
              fullWidth
              className="sm:w-auto"
            >
              Send to review
            </Button>
          </>
        }
      >
        <Textarea
          label="Why does this need a second opinion?"
          placeholder="e.g. Income is strong but the fraud graph shows a shared device."
          hint="Captured in the audit trail alongside your name."
        />
      </Modal>

      <ConfirmModal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        loading={confirming}
        tone="danger"
        title="Reject this application?"
        description="The applicant will be told they were not approved. This cannot be undone from here."
        confirmLabel="Reject application"
        onConfirm={() => {
          setConfirming(true)
          setTimeout(() => {
            setConfirming(false)
            setConfirmOpen(false)
            toast.success('Application rejected', 'The decision is recorded in the audit trail.')
          }, 1200)
        }}
      />

      <StickyActionBar className="md:hidden">
        <Button variant="danger" leadingIcon={<Trash2 className="size-4" />}>
          Reject
        </Button>
        <Button variant="success" leadingIcon={<CheckCircle2 className="size-4" />}>
          Approve
        </Button>
      </StickyActionBar>
    </>
  )
}
