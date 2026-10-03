"""Regression coverage for the optional legacy Python notifier, without Flask or SMTP."""
import contextlib
import io
import json
import os
from pathlib import Path
import runpy
import sys
import types
import unittest
import urllib.request
from unittest import mock

SOURCE = Path(__file__).resolve().parents[1] / 'jellyfin_notifier.py'


def load_legacy():
    flask = types.ModuleType('flask')
    flask.Flask = mock.Mock(return_value=mock.Mock())
    flask.request = mock.Mock()
    environment = {
        'JELLYFIN_API_KEY': 'legacy-regression-only-key',
        'SMTP_USER': 'legacy@example.invalid',
        'SMTP_PASS': 'legacy-regression-only-password',
        'NOTIFY_MAP_JSON': '{}',
    }
    with mock.patch.dict(sys.modules, {'flask': flask}), mock.patch.dict(os.environ, environment):
        return runpy.run_path(str(SOURCE))


class LegacyNotifierTests(unittest.TestCase):
    def test_credentials_are_taken_from_external_configuration(self):
        module = load_legacy()
        # Boolean assertions cannot accidentally print old secret literals on failure.
        self.assertTrue(module['JELLYFIN_API_KEY'] == 'legacy-regression-only-key', 'Jellyfin key must come from the environment')
        self.assertTrue(module['SMTP_PASS'] == 'legacy-regression-only-password', 'SMTP password must come from the environment')
        self.assertTrue(module['SMTP_USER'] == 'legacy@example.invalid', 'SMTP user must come from the environment')
        self.assertTrue(module['NOTIFY_MAP'] == {}, 'No personal recipients may be hardcoded')

    def test_tag_lookup_uses_supported_authorization_without_a_credential_url(self):
        module = load_legacy()
        response = mock.MagicMock()
        response.__enter__.return_value.read.return_value = json.dumps({'Items': [{'Tags': ['notify-dad']}]}).encode()
        with mock.patch('urllib.request.urlopen', return_value=response) as open_url:
            tags = module['get_tags_from_api']('fixture-item')
        request = open_url.call_args.args[0]
        self.assertTrue('api_key=' not in request.full_url, 'Credentials must not be sent in the URL')
        self.assertTrue(request.get_header('Authorization') == 'MediaBrowser Token="legacy-regression-only-key"', 'Use modern Jellyfin authorization')
        self.assertEqual(tags, ['notify-dad'])

    def test_unconfigured_legacy_notifier_does_not_call_jellyfin(self):
        module = load_legacy()
        module['get_tags_from_api'].__globals__['JELLYFIN_API_KEY'] = ''
        with mock.patch('urllib.request.urlopen') as open_url, contextlib.redirect_stdout(io.StringIO()):
            tags = module['get_tags_from_api']('fixture-item')
        self.assertEqual(tags, [])
        open_url.assert_not_called()


if __name__ == '__main__':
    unittest.main()
