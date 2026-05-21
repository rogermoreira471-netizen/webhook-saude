
const { initializeApp, cert, getApps } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

if (!getApps().length) {
  initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }),
  });
}

const db = getFirestore();

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const body = req.body;
    const email = body?.Customer?.email || body?.customer?.email;
    const status = body?.status || body?.order_status;
    const productName = body?.Product?.name || body?.product?.name || '';

    if (!email) {
      return res.status(400).json({ error: 'Email não encontrado' });
    }

    // Determinar o plano com base no produto
    let plan = 'free';
    if (status === 'paid' || status === 'approved') {
      if (productName.toLowerCase().includes('premium') || productName.toLowerCase().includes('elite')) {
        plan = 'premium';
      } else {
        plan = 'basic';
      }
    } else if (status === 'refunded' || status === 'cancelled' || status === 'chargeback') {
      plan = 'free';
    }

    // Buscar usuário pelo email no Firestore
    const usersRef = db.collection('users');
    const query = await usersRef.where('email', '==', email).get();

    if (query.empty) {
      // Salvar para quando o usuário se cadastrar
      await db.collection('pending_plans').doc(email).set({
        email,
        plan,
        updatedAt: new Date().toISOString(),
      });
      return res.status(200).json({ message: 'Plano salvo para cadastro futuro', plan });
    }

    // Atualizar plano do usuário
    const userDoc = query.docs[0];
    await userDoc.ref.update({
      plan,
      updatedAt: new Date().toISOString(),
    });

    return res.status(200).json({ message: 'Plano atualizado com sucesso', plan });
  } catch (error) {
    console.error('Webhook error:', error);
    return res.status(500).json({ error: 'Erro interno' });
  }
}
