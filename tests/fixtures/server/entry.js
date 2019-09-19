import { router, app } from '../app'

export default function serverEntry (context) {
  return new Promise((resolve, reject) => {
    router.push(context.url)
    router.onReady(() => resolve(app), reject)
  })
}
