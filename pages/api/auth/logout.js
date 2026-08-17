import { serialize } from 'cookie';

export default function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error:'Method Not Allowed' });
  }

  const cookieOptions = {
    httpOnly:true,
    secure:process.env.NODE_ENV === 'production',
    sameSite:'lax',
    expires:new Date(0),
    maxAge:0,
    path:'/',
  };

  res.setHeader('Set-Cookie', [
    serialize('token', '', cookieOptions),
    serialize('admin_token', '', cookieOptions),
  ]);
  return res.status(200).json({ success:true });
}
