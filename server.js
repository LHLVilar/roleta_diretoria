// Trecho do server.js:
app.post('/add-name', async (req, res) => {
    const { name, list, socketId } = req.body; 

    if (!name || !list || !socketId) { // socketId está vazio!
        return res.status(400).json({ message: 'Nome, lista e ID do socket são obrigatórios.' }); 
    }
    // ...
});
