"""Exercise Warren's actual fixed Observer SQL against an in-memory Kanban DB."""
import json
from pathlib import Path
import re
import shlex
import sqlite3
import unittest

SOURCE = (Path(__file__).resolve().parents[1] / 'src-tauri/src/ssh.rs').read_text(encoding='utf-8')


def query(name):
    literal = re.search(r'const ' + name + r': &str = ("(?:[^"\\]|\\.)*");', SOURCE).group(1)
    args = shlex.split(json.loads(literal))
    assert args[:3] == ['sqlite3', '-readonly', '-json'] and len(args) == 5
    assert args[3] == '/root/.hermes/kanban.db'
    return args[4]


class ObserverQueryTests(unittest.TestCase):
    def setUp(self):
        self.db = sqlite3.connect(':memory:')
        self.db.row_factory = sqlite3.Row
        self.db.execute('CREATE TABLE tasks (id TEXT, title TEXT, assignee TEXT, status TEXT, priority TEXT, created_at INTEGER)')
        for index, status in enumerate(('triage','todo','scheduled','ready','running','blocked','review','done','archived')):
            self.db.execute('INSERT INTO tasks VALUES (?,?,?,?,?,?)', (status,status,'nexus',status,'normal',100+index))

    def tearDown(self):
        self.db.close()

    def test_fleet_reads_active_and_queued_states_without_terminal_or_triage_work(self):
        before = self.db.total_changes
        rows = self.db.execute(query('OBSERVER_FLEET')).fetchall()
        self.assertEqual({row['status'] for row in rows}, {'todo','scheduled','ready','running','blocked','review'})
        self.assertTrue(all(row['assignee'] == 'nexus' for row in rows))
        self.assertEqual(self.db.total_changes, before)

    def test_default_ledger_contains_every_live_state_and_hides_archived(self):
        rows = self.db.execute(query('OBSERVER_TASKS')).fetchall()
        self.assertEqual({row['status'] for row in rows}, {'triage','todo','scheduled','ready','running','blocked','review','done'})

    def test_archived_rows_cannot_displace_the_twenty_five_latest_live_tasks(self):
        for index in range(30):
            self.db.execute('INSERT INTO tasks VALUES (?,?,?,?,?,?)', ('live-'+str(index),'live','forge','running','normal',1000+index))
        for index in range(40):
            self.db.execute('INSERT INTO tasks VALUES (?,?,?,?,?,?)', ('old-'+str(index),'archived','nexus','archived','normal',2000+index))
        rows = self.db.execute(query('OBSERVER_TASKS')).fetchall()
        self.assertEqual(len(rows),25)
        self.assertEqual([row['id'] for row in rows], ['live-'+str(index) for index in range(29,4,-1)])

    def test_archive_opt_in_returns_archived_rows_without_mutating_tasks(self):
        before = self.db.total_changes
        rows = self.db.execute(query('OBSERVER_TASKS_WITH_ARCHIVED')).fetchall()
        self.assertEqual(len(rows),9)
        self.assertIn('archived',{row['status'] for row in rows})
        self.assertEqual(self.db.total_changes,before)


if __name__ == '__main__':
    unittest.main()
