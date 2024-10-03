const express = require('express');
const fs = require('fs');
const app = express();
app.use(express.json());
const menu = JSON.parse(fs.readFileSync(`${__dirname}/dev-doc/menu.json`));

app.get('/api/menu', (req, res) => {
  const name = req.query.name;
  console.log(name);
  res.status(200).json({ status: 'success', result: menu.length, menu: menu });
});
app.get('/api/menu/:id', (req, res) => {
  const id = req.params.id * 1;
  const menuItem = menu.find((item) => item.id === id);

  if (!menuItem) {
    return res.status(404).json({ status: 'Failed', message: 'Invalid Id' });
  }

  res.status(200).json({ status: 'success', menuItem });
});

app.post('/api/menu', (req, res) => {});

app.patch('/api/menu/:id', (req, res) => {
  const id = req.params.id * 1;
  const menuItem = menu.find((item) => item.id === id);
  if (!menuItem) {
    return res.status(404).json({
      status: 'Failed',
      message: 'Invalid Id',
    });
  }
});
app.delete('/api/menu/:id', (req, res) => {
  const id = req.params.id * 1;
  const menuItem = menu.find((item) => item.id === id);
  if (!menuItem) {
    return res.status(404).json({
      status: 'Failed',
      message: 'Invalid Id',
    });
  }

  res.status(204).json({
    status: 'success',
    menu: null,
  });
});

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`The Server Run On Prort ${PORT}`);
});
