'use client'

import * as React from 'react'
import { Tab, TabList, TabPanel, Tabs } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'

/**
 * The applicant view's panel switcher.
 *
 * Desktop shows every panel stacked down the page — a loan officer with a
 * large screen should not have to click to compare the score against the
 * affordability figure.
 *
 * Mobile shows one panel at a time behind tabs, because four full panels on a
 * 320px screen is several minutes of scrolling before the decision buttons
 * come into view.
 *
 * Both layouts render the same children; only the presentation differs, so
 * there is no risk of the two drifting apart.
 */
export function DecisionPanels({
  score,
  affordability,
  fraud,
  history,
  fraudFlagCount,
  alertCount,
}: {
  score: React.ReactNode
  affordability: React.ReactNode
  fraud: React.ReactNode
  history: React.ReactNode
  fraudFlagCount: number
  alertCount: number
}) {
  return (
    <>
      {/* ---------- mobile: one panel at a time ---------- */}
      <div className="lg:hidden">
        <Tabs defaultValue="score">
          <TabList aria-label="Applicant assessment">
            <Tab value="score">Score</Tab>
            <Tab value="afford">Affordability</Tab>
            <Tab
              value="fraud"
              badge={
                fraudFlagCount > 0 ? (
                  <Badge tone="danger" size="sm">
                    {fraudFlagCount}
                  </Badge>
                ) : undefined
              }
            >
              Fraud
            </Tab>
            <Tab
              value="history"
              badge={
                alertCount > 0 ? (
                  <Badge tone="warning" size="sm">
                    {alertCount}
                  </Badge>
                ) : undefined
              }
            >
              History
            </Tab>
          </TabList>

          <TabPanel value="score">{score}</TabPanel>
          <TabPanel value="afford">{affordability}</TabPanel>
          <TabPanel value="fraud">{fraud}</TabPanel>
          <TabPanel value="history">{history}</TabPanel>
        </Tabs>
      </div>

      {/* ---------- desktop: everything at once ---------- */}
      <div className="hidden flex-col gap-8 lg:flex">
        <section aria-label="Credit score">{score}</section>
        <section aria-label="Affordability">{affordability}</section>
        <section aria-label="Fraud assessment">{fraud}</section>
        <section aria-label="Signal history">{history}</section>
      </div>
    </>
  )
}
