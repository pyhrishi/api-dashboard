export async function GET() {
  const securityTxt = `Contact: security@zintlr.com
Contact: https://zinbit.zintlr.com/security/bug-bounty
Preferred-Languages: en
Canonical: https://zinbit.zintlr.com/.well-known/security.txt
Policy: https://zinbit.zintlr.com/security/policy

# Bug Bounty Safe Harbor
# If you are a registered security researcher, you can bypass the Edge WAF 
# for deep application testing by providing your unique researcher token in the headers:
# X-Bug-Bounty-Token: <your-token>
`;

  return new Response(securityTxt, {
    status: 200,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'max-age=86400, stale-while-revalidate=86400',
    },
  });
}
