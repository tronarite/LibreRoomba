(function () {
  'use strict';

  function initSchedule() {
    const container = document.getElementById('schedule-body');
    if (!container) return;

    let scheduleItems = [];

    // Contenedor del mensaje
    let msgEl = document.getElementById('schedule-msg');
    if (!msgEl) {
      msgEl = document.createElement('div');
      msgEl.id = 'schedule-msg';
      container.parentNode.insertBefore(msgEl, container.nextSibling);
    }

    function setMessage(text, isError) {
      msgEl.textContent = text;
      msgEl.style.color = isError ? 'red' : 'green';
    }

    // Botones de acción (Añadir y Guardar)
    let actionsContainer = document.getElementById('schedule-actions');
    if (!actionsContainer) {
      actionsContainer = document.createElement('div');
      actionsContainer.id = 'schedule-actions';

      const btnAdd = document.createElement('button');
      btnAdd.type = 'button';
      btnAdd.id = 'schedule-add-btn';
      btnAdd.textContent = 'Añadir';
      btnAdd.addEventListener('click', onAddItem);

      const btnSave = document.createElement('button');
      btnSave.type = 'button';
      btnSave.id = 'schedule-save-btn';
      btnSave.textContent = 'Guardar';
      btnSave.addEventListener('click', onSaveSchedule);

      actionsContainer.appendChild(btnAdd);
      actionsContainer.appendChild(btnSave);
      container.parentNode.insertBefore(actionsContainer, msgEl);
    }

    const DAY_MAP = [
      { label: 'L', val: 1 },
      { label: 'M', val: 2 },
      { label: 'X', val: 3 },
      { label: 'J', val: 4 },
      { label: 'V', val: 5 },
      { label: 'S', val: 6 },
      { label: 'D', val: 0 }
    ];

    function render() {
      while (container.firstChild) {
        container.removeChild(container.firstChild);
      }

      scheduleItems.forEach(function (item, index) {
        const row = document.createElement('div');
        row.className = 'schedule-row';

        // 1. Checkbox activada
        const chk = document.createElement('input');
        chk.type = 'checkbox';
        chk.checked = !!item.enabled;
        chk.addEventListener('change', function () {
          item.enabled = chk.checked;
        });
        row.appendChild(chk);

        // 2. 7 Botones L M X J V S D
        const daysContainer = document.createElement('span');
        daysContainer.className = 'schedule-days';

        const itemDays = Array.isArray(item.start && item.start.day) ? item.start.day : [];

        DAY_MAP.forEach(function (d) {
          const dayBtn = document.createElement('button');
          dayBtn.type = 'button';
          dayBtn.textContent = d.label;
          dayBtn.className = 'schedule-day-btn';

          let isSelected = itemDays.includes(d.val);
          updateDayBtnStyle(dayBtn, isSelected);

          dayBtn.addEventListener('click', function () {
            if (!item.start) {
              item.start = { day: [], hour: 0, min: 0 };
            }
            if (!Array.isArray(item.start.day)) {
              item.start.day = [];
            }
            const idx = item.start.day.indexOf(d.val);
            if (idx === -1) {
              item.start.day.push(d.val);
              isSelected = true;
            } else {
              item.start.day.splice(idx, 1);
              isSelected = false;
            }
            item.start.day.sort(function (a, b) { return a - b; });
            updateDayBtnStyle(dayBtn, isSelected);
          });

          daysContainer.appendChild(dayBtn);
        });
        row.appendChild(daysContainer);

        // 3. Input type=time
        const timeInput = document.createElement('input');
        timeInput.type = 'time';
        const h = (item.start && typeof item.start.hour === 'number') ? item.start.hour : 0;
        const m = (item.start && typeof item.start.min === 'number') ? item.start.min : 0;
        timeInput.value = String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');

        timeInput.addEventListener('change', function () {
          const parts = timeInput.value.split(':');
          if (parts.length === 2) {
            if (!item.start) {
              item.start = { day: [], hour: 0, min: 0 };
            }
            item.start.hour = parseInt(parts[0], 10) || 0;
            item.start.min = parseInt(parts[1], 10) || 0;
          }
        });
        row.appendChild(timeInput);

        // 4. Botón Eliminar
        const btnDelete = document.createElement('button');
        btnDelete.type = 'button';
        btnDelete.textContent = 'Eliminar';
        btnDelete.addEventListener('click', function () {
          scheduleItems.splice(index, 1);
          render();
        });
        row.appendChild(btnDelete);

        container.appendChild(row);
      });
    }

    function updateDayBtnStyle(btn, isSelected) {
      if (isSelected) {
        btn.style.fontWeight = 'bold';
        btn.style.backgroundColor = '#007bff';
        btn.style.color = '#ffffff';
      } else {
        btn.style.fontWeight = 'normal';
        btn.style.backgroundColor = '';
        btn.style.color = '';
      }
    }

    function onAddItem() {
      if (scheduleItems.length >= 10) {
        setMessage('Máximo 10 programaciones permitidas.', true);
        return;
      }
      scheduleItems.push({
        enabled: true,
        type: 0,
        start: {
          day: [1, 2, 3, 4, 5],
          hour: 9,
          min: 0
        },
        cmd: {
          command: 'start',
          time: Math.floor(Date.now() / 1000),
          initiator: 'schedule'
        }
      });
      render();
    }

    function loadSchedule() {
      fetch('/api/schedule')
        .then(function (res) {
          if (!res.ok) throw new Error('Error al cargar la programación');
          return res.json();
        })
        .then(function (data) {
          if (Array.isArray(data)) {
            scheduleItems = data;
          } else if (data && Array.isArray(data.items)) {
            scheduleItems = data.items;
          } else {
            scheduleItems = [];
          }
          render();
        })
        .catch(function (err) {
          setMessage(err.message || 'Error al conectar con el servidor', true);
        });
    }

    function onSaveSchedule() {
      setMessage('Guardando...', false);

      fetch('/api/schedule', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ items: scheduleItems })
      })
        .then(function (res) {
          return res.json().then(function (json) {
            if (!res.ok) {
              throw new Error(json.error || json.message || 'Error al guardar');
            }
            return json;
          });
        })
        .then(function () {
          setMessage('Guardado', false);
        })
        .catch(function (err) {
          setMessage(err.message || 'Error al guardar la programación', true);
        });
    }

    loadSchedule();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSchedule);
  } else {
    initSchedule();
  }
})();
