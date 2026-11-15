/// <reference types="vite/client" />

import type { StudioApi } from '../../shared/types'

declare global {
  interface Window {
    studio: StudioApi
  }
}

export {}

