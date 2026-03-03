import { useAppStore } from '../state/appStore'

const initialStoreState = useAppStore.getState()

export const resetAppStore = (): void => {
  useAppStore.setState(initialStoreState, true)
}
