export type Scenario = 'funded' | 'not_funded'
export type Side = 'UP' | 'DOWN'
export type ProjectId = 'ascoe' | 'civichat' | 'handbook' | 'yadokari'
export type Phase = 'open' | 'decided' | 'resolved'

export type MarketState = { qUp: number; qDown: number; b: number }
export type Project = {
  id: ProjectId
  name: string
  rangeMin: number
  rangeMax: number
  markets: Record<Scenario, MarketState>
}

export type Holdings = Record<ProjectId, Record<Scenario, Record<Side, number>>>
export type BaseHoldings = Record<ProjectId, { funded: number; not_funded: number }>
export type Account = {
  id: string
  name: string
  balance: number
  isAdmin: boolean
  holdings: Holdings
  base: BaseHoldings
}

