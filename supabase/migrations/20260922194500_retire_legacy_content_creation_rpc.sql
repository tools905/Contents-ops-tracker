-- New content uses create_content_item(), which applies the approved team RACI
-- and route. Retire the earlier free-form creation RPC from the Data API.
revoke all on function public.create_content_with_raci(
  text, text, text, public.content_pillar, timestamptz,
  uuid, uuid[], uuid[], uuid[], boolean
) from public, anon, authenticated;
