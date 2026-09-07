<?php
declare(strict_types=1);

final class ScholarServerAppearanceExtension extends Minz_Extension {
    public function init(): void {
        parent::init();
        $settings = [];
        if (is_file('/runtime/appearance.json')) {
            $settings = json_decode(file_get_contents('/runtime/appearance.json'), true) ?? [];
        }
        if (($settings['style'] ?? 'scholarserver') !== 'scholarserver') return;

        // Presentation only: never save or replace a user's native display settings.
        $this->registerHook(Minz_HookType::FreshrssInit, function (): void {
            Minz_View::appendStyle(Minz_Url::display('/themes/ScholarServer/theme.css'));
            Minz_View::appendScript(Minz_Url::display('/themes/ScholarServer/theme.js'));
        });
    }
}
