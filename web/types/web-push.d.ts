// Types for the parts of web-push we use (the package ships without TypeScript types)
declare module "web-push" {
  type PushSubscription = { endpoint: string; keys: { p256dh: string; auth: string } };
  const webpush: {
    setVapidDetails(subject: string, publicKey: string, privateKey: string): void;
    sendNotification(subscription: PushSubscription, payload?: string, options?: { TTL?: number }): Promise<unknown>;
  };
  export default webpush;
}
